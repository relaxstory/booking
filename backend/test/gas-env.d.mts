// 前端開發用 mock 匯入 gas-env.mjs 時的型別宣告
export declare class MockSpreadsheet {}
export declare const MOCK_CLIENT_ID: string;
export declare function formatDate(date: Date, tz: string, pattern: string): string;
export declare function makeGlobals(state: { ss: MockSpreadsheet; now: () => Date }): {
  cache: Map<string, string>;
  mails: { to: string; subject: string; body: string; name?: string }[];
  triggers: unknown[];
  globals: Record<string, unknown>;
};
export declare function loadBackend(sources: string[], globals: Record<string, unknown>, nowFn: () => Date): (code: string) => unknown;
