// Scalar controls for OpenCode's pinned AssistantTool shape. Payloads remain synthetic.
export type SyntheticTool = {
  readonly id: string;
  readonly name: string;
  readonly status: "streaming" | "running" | "completed" | "error";
  readonly error?: string;
  readonly ran?: number;
  readonly completed?: number;
  readonly nested?: readonly SyntheticTool[];
};
export function toolContent(call: SyntheticTool): object {
  return {
    type: "tool",
    id: call.id,
    name: call.name,
    time: { created: 0, ran: call.ran, completed: call.completed },
    executed: false,
    state: {
      status: call.status,
      input:
        call.status === "streaming"
          ? "SYNTHETIC PRIVATE INPUT"
          : { code: "SYNTHETIC PRIVATE INPUT" },
      error:
        call.error === undefined
          ? undefined
          : { type: call.error, message: "SYNTHETIC PRIVATE ERROR" },
      content: [{ type: "text", text: "SYNTHETIC PRIVATE OUTPUT" }],
      // Code Mode stores its nested calls in metadata.toolCalls, not assistant content.
      metadata: {
        toolCalls: (call.nested ?? []).map((nested) => ({
          tool: nested.name,
          status: nested.status,
          input: { code: "SYNTHETIC PRIVATE NESTED INPUT" },
        })),
      },
    },
  };
}
