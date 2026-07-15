import type { OfficialAIServiceDependencies } from "./ports";
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
  const result = rejected(command, dependencies, code, message, stage, offerState);
  await dependencies.audit.register({
    ...auditBase(command, dependencies), provider, model, latencyMs, result: "rejected", replay: false,
    failureStage: stage, errorCode: code, postsPrepared, postsPersisted, transitionRequested, transitionCompleted: false
  });
  if (fingerprint) await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
  return result;
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

  // 2. Idempotência (antes de qualquer I/O de negócio — preserva comportamento original).
  //    A chave é única por offer. O resultado armazenado reflete o modo que foi executado.
  const fingerprint = stableSerialize(command);
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

  // 2.5. Processamento em lote (Disparo Oficial após Discovery - ADR-014)
  if (command.offerId === "ALL_PENDING") {
    if (!dependencies.offers.findPendingWithoutDrafts) {
      return rejectAndRecord(command, dependencies, fingerprint, "DEPENDENCY_UNAVAILABLE", "findPendingWithoutDrafts is not available", "preconditions");
    }
    const pendingOffers = await dependencies.offers.findPendingWithoutDrafts(command.tenantId);
    const draftsCreated: unknown[] = [];
    let processed = 0;
    for (const offer of pendingOffers) {
      processed++;
      const subCommand: OfficialAICommand = {
        ...command,
        commandId: `${command.commandId}:${offer.id}`,
        idempotencyKey: `ai:${offer.id}:v1`,
        offerId: offer.id
      };
      const subResult = await generateOfficialAI(subCommand, dependencies);
      if (subResult.status === "drafted" || subResult.status === "approved") {
        if (subResult.drafts) draftsCreated.push(...subResult.drafts);
      }
    }
    const result: OfficialAIDraftedResult = {
      status: "drafted",
      commandId: command.commandId,
      offerId: "ALL_PENDING",
      offerState: "pending_manual_review",
      content: {
        title: "Processamento em lote (ALL_PENDING)",
        description: `Processadas ${processed} ofertas em pending_manual_review. Foram gerados ${draftsCreated.length} drafts no total.`,
        shortCopy: `Processadas ${processed} ofertas. Drafts gerados: ${draftsCreated.length}`,
        longCopy: `Processamento em lote concluído para ${processed} ofertas no locatário. Total de ${draftsCreated.length} drafts criados.`,
        hashtags: ["#OfficialAI", "#BatchDrafts"],
        callToAction: "Verifique o painel operacional para curadoria manual.",
        highlights: [`${processed} ofertas analisadas`, `${draftsCreated.length} drafts gerados`],
        explanation: "Geração em lote das ofertas pendentes sem drafts.",
        channelCopies: {
          telegram: `Processadas ${processed} ofertas. Drafts gerados: ${draftsCreated.length}`,
          instagram: `Processadas ${processed} ofertas. Drafts gerados: ${draftsCreated.length}`,
          whatsapp: `Processadas ${processed} ofertas. Drafts gerados: ${draftsCreated.length}`
        }
      },
      drafts: draftsCreated as any,
      providerEvidence: { provider: "official-ai-batch", model: "batch-orchestrator", latencyMs: 0 },
      completedAt: dependencies.clock.now()
    };
    await dependencies.audit.register({
      ...auditBase(command, dependencies), provider: "official-ai-batch", model: "batch-orchestrator",
      latencyMs: 0, result: "drafted", replay: false, failureStage: null, errorCode: null,
      postsPrepared: processed * command.channels.length, postsPersisted: draftsCreated.length,
      transitionRequested: false, transitionCompleted: false
    });
    await dependencies.idempotency.complete(command.idempotencyKey, fingerprint, result);
    return result;
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
