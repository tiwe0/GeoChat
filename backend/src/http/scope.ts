import type { ConversationDataScope } from "../db/conversation-repository";

export type DataScopeResolver = (request: Request) => Promise<
  | { scope: ConversationDataScope }
  | { response: Response }
>;
