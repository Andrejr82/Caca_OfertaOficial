import type { OfficialAIServiceDependencies } from "./ports";
import type { BatchCursor } from "./ports";
import { validateOfficialAIContent } from "./content-schema";
import { buildOfficialPrompt } from "./prompt";
import type {
  OfficialAIAuditRecord,
  OfficialAICommand,
  OfficialAIDraftedResult,
  OfficialAIOffer,
  OfficialAIRejectedResult,
  OfficialAIResult
} from "./types";
import { validateCandidateOffer, validateOfficialAICommand } from "./validation";

// ---------------------------------------------------------------------------
// Resolução do modo (ADR-014)
// A Official AI determina internamente o fluxo consultando o estado real da oferta.
// Nenhum parâmetro externo seleciona o modo. A máquina de estados é a autoridade.
// ---------------------------------------------------------------------------
type InternalMode = "draft_generation" | "approval";

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fingerprint canônico da operação de IA.
 * Exclui campos voláteis de identidade do ciclo (commandId, correlationId, causationId, requestedAt).
 * Garante que a mesma operação funcional produza o mesmo fingerprint em qualquer ciclo.
 */
function buildOfficialAIFingerprint(command: OfficialAICommand): string {
  const stable = {
    contractVersion: command.contractVersion,
    idempotencyKey: command.idempotencyKey,
    offerId: command.offerId,
    tenantId: command.tenantId,
    channels: [...command.channels].sort(),
    providerPreference: command.providerPreference ?? null,
    actor: command.actor,
    origin: command.origin,
    reason: command.reason
  };
  return stableSerialize(stable);
}

function rejected(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies,
  code: string,
  message: string,
  failureStage: string,
  offerState: "pending_manual_review" | "selected" | "unknown" = "unknown"
): OfficialAIRejectedResult {
  return {
    status: "rejected",
    code,
    message,
    commandId: command.commandId,
    offerId: command.offerId,
    offerState,
    failureStage,
    rejectedAt: dependencies.clock.now()
  };
}

function auditBase(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies
): Omit<OfficialAIAuditRecord, "provider" | "model" | "latencyMs" | "result" | "replay" | "failureStage" | "errorCode" | "postsPrepared" | "postsPersisted" | "transitionRequested" | "transitionCompleted"> {
  return {
    timestamp: dependencies.clock.now(),
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    causationId: command.causationId,
    offerId: command.offerId,
    tenantId: command.tenantId,
    actor: command.actor,
    origin: command.origin,
    reason: command.reason
  };
}

async function rejectAndRecord(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies,
  fingerprint: string | null,
  code: string,
  message: string,
  stage: string,
  offerState: "pending_manual_review" | "selected" | "unknown" = "unknown",
  provider: string | null = null,
  model: string | null = null,
  latencyMs: number | null = null,
  postsPrepared = 0,
  postsPersisted = 0,
  transitionRequested = false
): Promise<OfficialAIRejectedResult> {
  const isBatch = command.offerId === "ALL_PENDING";
  const result = rejected(command, dependencies, code, message, stage, offerState);
  await dependencies.audit.register({
    ...auditBase(command, dependencies), provider, model, latencyMs, result: "rejected", replay: false,
    failureStage: stage, errorCode: code, postsPrepared, postsPersisted, transitionRequested, transitionCompleted: false,
    batchCompleted: isBatch ? false : undefined
  });
  if (fingerprint) await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
  return result;
}

function isValidCursorTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

// ---------------------------------------------------------------------------
// Resolução do modo via máquina de estados (ADR-014)
// ---------------------------------------------------------------------------

function resolveMode(
  offer: OfficialAIOffer | null,
  tenantId: string
):
  | { ok: true; mode: InternalMode }
  | { ok: false; code: string; message: string; offerState: "pending_manual_review" | "selected" | "unknown" } {

  if (!offer) {
    return { ok: false, code: "ENTITY_NOT_FOUND", message: "Offer was not found", offerState: "unknown" };
  }
  if (offer.tenantId !== tenantId) {
    return { ok: false, code: "TENANT_MISMATCH", message: "Offer tenant does not match command", offerState: "unknown" };
  }

  // A máquina de estados é a única autoridade para determinar o modo.
  if (offer.state === "pending_manual_review") {
    return { ok: true, mode: "draft_generation" };
  }
  if (offer.state === "selected") {
    return { ok: true, mode: "approval" };
  }

  // approved, posted, rejected, deleted — estados que a Official AI não processa.
  return {
    ok: false,
    code: "INVALID_OFFER_STATE",
    message: `Official AI does not process offers in state: ${offer.state}`,
    offerState: "unknown"
  };
}

function validateOfferDetails(
  offer: OfficialAIOffer,
  mode: InternalMode
): { code: string; message: string } | null {
  // Para o modo approval: valida versão (selected = version 1).
  if (mode === "approval" && offer.version !== 1) {
    return { code: "VERSION_CONFLICT", message: "Offer version does not match expected version for approval" };
  }
  // Contrato candidato válido para ambos os modos.
  const candidateError = validateCandidateOffer(offer);
  return candidateError ? { code: "INVALID_CANDIDATE_CONTRACT", message: candidateError } : null;
}

// ---------------------------------------------------------------------------
// Função pública única da Official AI (ADR-014)
// Interface pública única: generateOfficialAI.
// O modo é determinado internamente pela IA com base no estado real da oferta.
// ---------------------------------------------------------------------------

export async function generateOfficialAI(
  command: OfficialAICommand,
  dependencies: OfficialAIServiceDependencies
): Promise<OfficialAIResult> {

  // 1. Validação estrutural do comando.
  const commandError = validateOfficialAICommand(command);
  if (commandError) {
    return rejectAndRecord(command, dependencies, null, "INVALID_AI_COMMAND", commandError, "command");
  }

  // 2. Idempotência (antes de qualquer I/O de negócio).
  //    Fingerprint canônico: exclui campos voláteis (commandId, correlationId, causationId, requestedAt).
  const fingerprint = buildOfficialAIFingerprint(command);
  const reservation = await dependencies.idempotency.begin(command.idempotencyKey, fingerprint);
  if (reservation.status === "conflict") {
    return rejectAndRecord(command, dependencies, null, "IDEMPOTENCY_CONFLICT", "Idempotency key was used with a different payload", "idempotency");
  }
  if (reservation.status === "replay" || reservation.status === "pending") {
    const result = reservation.status === "replay" ? reservation.result : await reservation.result;
    await dependencies.audit.register({
      ...auditBase(command, dependencies), provider: null, model: null, latencyMs: null,
      result: "idempotent_replay", replay: true, failureStage: null, errorCode: null,
      postsPrepared: 0, postsPersisted: 0, transitionRequested: false, transitionCompleted: false
    });
    return result;
  }

  // 2.5. Processamento completo ALL_PENDING — percorre toda a fila em páginas de até 50 (ADR-014).
  if (command.offerId === "ALL_PENDING") {
    if (!dependencies.offers.findPendingWithoutDrafts) {
      return rejectAndRecord(command, dependencies, fingerprint, "DEPENDENCY_UNAVAILABLE", "findPendingWithoutDrafts is not available", "preconditions");
    }

    // Limite de segurança: protege contra defeito de cursor infinito. Não é o batch size por página.
    const SAFETY_LIMIT = 10_000;
    const PAGE_SIZE = 50; // ponytail: fixo; usar env se precisar flexibilizar

    const metrics = {
      pagesProcessed: 0,
      offersVisited: 0,
      draftedOffers: 0,
      draftsPersisted: 0,
      rejectedOffers: 0,
      invalidCandidateContracts: 0,
      idempotentReplays: 0,
      idempotencyConflicts: 0,
      unexpectedErrors: 0,
      duplicatedOffersPrevented: 0,
      cursorStalls: 0,
      safetyLimitReached: false
    };

    const draftsCreated: unknown[] = [];
    const visitedOfferIds = new Set<string>();
    let cursor: BatchCursor | undefined = undefined;
    let lastCursorKey = "";

    try {
      outerLoop:
      while (metrics.offersVisited < SAFETY_LIMIT) {
        let page;
        try {
          page = await dependencies.offers.findPendingWithoutDrafts!(command.tenantId, cursor);
        } catch (error) {
          const code = "BATCH_PAGE_READ_FAILED";
          const message = error instanceof Error ? error.message : String(error);
          return await rejectAndRecord(command, dependencies, fingerprint, code, message, "batch_page_read", "pending_manual_review", null, null, null, metrics.draftedOffers * command.channels.length, metrics.draftsPersisted);
        }

        if (page.length === 0) break;

        metrics.pagesProcessed++;

        // Proteção: cursor deve avançar a cada página.
        const newCursorKey = page.map((o) => o.id).join(",");
        if (newCursorKey === lastCursorKey) {
          metrics.cursorStalls++;
          return await rejectAndRecord(command, dependencies, fingerprint, "BATCH_CURSOR_STALLED", "Cursor stall detected", "batch_cursor", "pending_manual_review", null, null, null, metrics.draftedOffers * command.channels.length, metrics.draftsPersisted);
        }
        lastCursorKey = newCursorKey;

        for (const offer of page) {
          if (visitedOfferIds.has(offer.id)) {
            metrics.duplicatedOffersPrevented++;
            continue;
          }
          visitedOfferIds.add(offer.id);
          metrics.offersVisited++;

          if (metrics.offersVisited >= SAFETY_LIMIT) {
            metrics.safetyLimitReached = true;
            break outerLoop;
          }

          // Sub-command usa namespace v2 para drafts: evita colisão com registros v1 existentes.
          const subCommand: OfficialAICommand = {
            ...command,
            commandId: `${command.commandId}:${offer.id}`,
            idempotencyKey: `ai:draft:${offer.id}:v2`,
            offerId: offer.id
          };

          try {
            const subResult = await generateOfficialAI(subCommand, dependencies);
            if (subResult.status === "drafted" || subResult.status === "approved") {
              metrics.draftedOffers++;
              if (subResult.drafts) {
                metrics.draftsPersisted += subResult.drafts.length;
                draftsCreated.push(...subResult.drafts);
              }
            } else if (subResult.status === "rejected") {
              if (subResult.code === "IDEMPOTENCY_CONFLICT") {
                metrics.idempotencyConflicts++;
              } else if (subResult.code === "INVALID_CANDIDATE_CONTRACT") {
                metrics.invalidCandidateContracts++;
                metrics.rejectedOffers++;
              } else {
                metrics.rejectedOffers++;
              }
            } else {
              // idempotent_replay
              metrics.idempotentReplays++;
            }
          } catch (error) {
            metrics.unexpectedErrors++;
            await dependencies.audit.register({
              ...auditBase(subCommand, dependencies),
              provider: null, model: null, latencyMs: null,
              result: "rejected", replay: false,
              failureStage: "batch_loop", errorCode: "BATCH_ITEM_ERROR",
              postsPrepared: 0, postsPersisted: 0, transitionRequested: false, transitionCompleted: false
            }).catch(() => {});
          }

          if (!isValidCursorTimestamp(offer.createdAt)) {
            metrics.cursorStalls++;
            return await rejectAndRecord(command, dependencies, fingerprint, "BATCH_CURSOR_INVALID", "Invalid createdAt timestamp", "batch_cursor", "pending_manual_review", null, null, null, metrics.draftedOffers * command.channels.length, metrics.draftsPersisted);
          }
          cursor = { afterCreatedAt: offer.createdAt, afterId: offer.id };
        }
      }

      const safetyNote = metrics.safetyLimitReached ? " [BATCH_SAFETY_LIMIT_REACHED]" : "";
      const isComplete = !metrics.safetyLimitReached;
      const result: OfficialAIDraftedResult = {
        status: "drafted",
        commandId: command.commandId,
        offerId: "ALL_PENDING",
        offerState: "pending_manual_review",
        content: {
          title: "Processamento em lote (ALL_PENDING)",
          description: `Visitadas: ${metrics.offersVisited} | Páginas: ${metrics.pagesProcessed} | Drafts: ${metrics.draftedOffers} | Rejeitadas: ${metrics.rejectedOffers} | InvalidContract: ${metrics.invalidCandidateContracts}${safetyNote}`,
          shortCopy: `Lote: ${metrics.offersVisited} | OK: ${metrics.draftedOffers} | Fail: ${metrics.rejectedOffers}`,
          longCopy: `Processamento completo em ${metrics.pagesProcessed} páginas. ${metrics.draftsPersisted} drafts persistidos em ${metrics.draftedOffers} ofertas.`,
          hashtags: ["#OfficialAI", "#BatchDrafts"],
          callToAction: "Verifique o painel operacional para curadoria manual.",
          highlights: [
            `${metrics.offersVisited} ofertas visitadas`,
            `${metrics.draftedOffers} com drafts gerados`,
            `${metrics.rejectedOffers} rejeitadas`
          ],
          explanation: "Geração paginada de todas as ofertas pendentes sem drafts.",
          channelCopies: {
            telegram: `Lote ALL_PENDING: ${metrics.offersVisited} ofertas, ${metrics.draftedOffers} com drafts.`,
            instagram: `Lote ALL_PENDING: ${metrics.offersVisited} ofertas, ${metrics.draftedOffers} com drafts.`,
            whatsapp: `Lote ALL_PENDING: ${metrics.offersVisited} ofertas, ${metrics.draftedOffers} com drafts.`
          }
        },
        drafts: draftsCreated as any,
        providerEvidence: { provider: "official-ai-batch", model: "batch-orchestrator", latencyMs: 0 },
        completedAt: dependencies.clock.now(),
        batchCompleted: isComplete
      };
      await dependencies.audit.register({
        ...auditBase(command, dependencies), provider: "official-ai-batch", model: "batch-orchestrator",
        latencyMs: 0, result: "drafted", replay: false, failureStage: null,
        errorCode: metrics.safetyLimitReached ? "BATCH_SAFETY_LIMIT_REACHED" : null,
        postsPrepared: metrics.draftedOffers * command.channels.length,
        postsPersisted: metrics.draftsPersisted,
        transitionRequested: false, transitionCompleted: false,
        batchCompleted: isComplete
      });
      await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
      return result;
    } catch (error) {
      const code = "BATCH_UNEXPECTED_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      return await rejectAndRecord(command, dependencies, fingerprint, code, message, "batch_loop", "pending_manual_review", null, null, null, metrics.draftedOffers * command.channels.length, metrics.draftsPersisted);
    }
  }

  // 3. Leitura da oferta — estado real é a única autoridade para selecionar o modo (ADR-014).
  const offer = await dependencies.offers.findById(command.offerId, command.tenantId);

  // 4. Resolução do modo via máquina de estados.
  const modeResult = resolveMode(offer, command.tenantId);
  if (!modeResult.ok) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      modeResult.code, modeResult.message, "mode_resolution", modeResult.offerState
    );
  }
  const { mode } = modeResult;

  // 5. Validação de detalhes da oferta (versão, contrato candidato).
  const offerError = validateOfferDetails(offer!, mode);
  if (offerError) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      offerError.code, offerError.message, "preconditions",
      mode === "draft_generation" ? "pending_manual_review" : "selected"
    );
  }

  // 6. Resolução do provider (comum a ambos os modos).
  let provider;
  try {
    provider = dependencies.providers.resolve(command.providerPreference);
  } catch (error) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      "PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "Provider is unavailable",
      "provider_resolution",
      mode === "draft_generation" ? "pending_manual_review" : "selected"
    );
  }

  // 7. Inferência (comum a ambos os modos).
  let inference;
  try {
    inference = await provider.generate({
      prompt: buildOfficialPrompt(offer!, command.channels), correlationId: command.correlationId,
      timeoutMs: 30_000, temperature: 0.4, maxTokens: 2_000,
      metadata: { commandId: command.commandId, offerId: command.offerId }
    });
  } catch (error) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      "PROVIDER_FAILURE", error instanceof Error ? error.message : "Provider failed",
      "provider",
      mode === "draft_generation" ? "pending_manual_review" : "selected",
      provider.name, provider.model
    );
  }

  // 8. Validação do conteúdo gerado (comum a ambos os modos).
  const content = validateOfficialAIContent(inference.content, command.channels);
  if (!content) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      "INVALID_PROVIDER_OUTPUT", "Provider output does not match the official schema",
      "provider_output",
      mode === "draft_generation" ? "pending_manual_review" : "selected",
      inference.provider, inference.model, inference.latencyMs
    );
  }

  // 9. Persistência dos drafts (comum a ambos os modos).
  let drafts;
  try {
    drafts = await dependencies.content.persistDrafts({ command, offer: offer!, content, channels: command.channels });
  } catch (error) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      "DRAFT_PERSISTENCE_FAILURE", error instanceof Error ? error.message : "Draft persistence failed",
      "drafts",
      mode === "draft_generation" ? "pending_manual_review" : "selected",
      inference.provider, inference.model, inference.latencyMs, command.channels.length
    );
  }
  if (drafts.length !== command.channels.length || drafts.some((draft) => draft.state !== "draft")) {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      "INCOMPLETE_DRAFT_SET", "All requested draft posts must be persisted",
      "drafts",
      mode === "draft_generation" ? "pending_manual_review" : "selected",
      inference.provider, inference.model, inference.latencyMs, command.channels.length, drafts.length
    );
  }

  // ---------------------------------------------------------------------------
  // 10. Bifurcação pelo modo (ADR-014).
  //     Modo 1 — Draft Generation: nenhuma transição de estado, offer permanece pending_manual_review.
  //     Modo 2 — Approval: transição selected → approved (comportamento anterior inalterado).
  // ---------------------------------------------------------------------------

  if (mode === "draft_generation") {
    const result: OfficialAIDraftedResult = {
      status: "drafted",
      commandId: command.commandId,
      offerId: command.offerId,
      offerState: "pending_manual_review",
      content,
      drafts,
      providerEvidence: {
        provider: inference.provider, model: inference.model, latencyMs: inference.latencyMs,
        usage: inference.usage, finishReason: inference.finishReason
      },
      completedAt: dependencies.clock.now()
    };
    await dependencies.audit.register({
      ...auditBase(command, dependencies), provider: inference.provider, model: inference.model,
      latencyMs: inference.latencyMs, result: "drafted", replay: false, failureStage: null, errorCode: null,
      postsPrepared: command.channels.length, postsPersisted: drafts.length,
      transitionRequested: false, transitionCompleted: false
    });
    await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
    return result;
  }

  // Modo 2 — Approval (comportamento anterior inalterado).
  const approval = await dependencies.approval.approveSelected({ command, offer: offer!, drafts });
  if (approval.status === "rejected") {
    return rejectAndRecord(
      command, dependencies, fingerprint,
      approval.code, approval.message, "approval", "selected",
      inference.provider, inference.model, inference.latencyMs, command.channels.length, drafts.length, true
    );
  }

  const result: OfficialAIResult = {
    status: "approved", commandId: command.commandId, offerId: command.offerId, offerState: "approved",
    content, drafts, providerEvidence: {
      provider: inference.provider, model: inference.model, latencyMs: inference.latencyMs,
      usage: inference.usage, finishReason: inference.finishReason
    },
    stateAuditId: approval.auditId, completedAt: dependencies.clock.now()
  };
  await dependencies.audit.register({
    ...auditBase(command, dependencies), provider: inference.provider, model: inference.model,
    latencyMs: inference.latencyMs, result: "approved", replay: false, failureStage: null, errorCode: null,
    postsPrepared: command.channels.length, postsPersisted: drafts.length, transitionRequested: true, transitionCompleted: true
  });
  await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
  return result;
}
