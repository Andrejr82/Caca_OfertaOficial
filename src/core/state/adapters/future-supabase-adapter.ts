import {
  CompatibilityStateAdapter,
  type CompatibilityStateBindings
} from "./compatibility-adapter";

export type FutureSupabaseStateGateway = CompatibilityStateBindings;

export class FutureSupabaseStateAdapter extends CompatibilityStateAdapter {
  constructor(gateway: FutureSupabaseStateGateway) {
    super(gateway);
  }
}
