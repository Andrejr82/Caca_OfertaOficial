export declare function getShopeeV1RolloutConfig(env?: NodeJS.ProcessEnv): { shadow: boolean; percent: number };
export declare function evaluateDeterministicRollout(identifier: string | null | undefined, percent: number): boolean;
export declare function isShopeeV1EnabledFor(identifier: string | null | undefined, env?: NodeJS.ProcessEnv): boolean;
