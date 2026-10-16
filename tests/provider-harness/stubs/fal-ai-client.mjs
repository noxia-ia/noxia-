export function createFalClient() {
  const state = globalThis.__falStub;
  return {
    queue: {
      async submit(endpoint, options) {
        if (state.submitError) throw Object.assign(new Error("submit"), { status: state.submitError });
        state.lastEndpoint = endpoint;
        state.lastInput = options.input;
        return { request_id: state.requestId || "fal-job-123" };
      },
      async status(endpoint, options) {
        if (state.statusError) throw Object.assign(new Error("status"), { status: state.statusError });
        state.lastStatusEndpoint = endpoint;
        state.lastStatusRequestId = options.requestId;
        return { status: state.status || "IN_QUEUE" };
      },
      async result(endpoint, options) {
        if (state.resultError) throw Object.assign(new Error("result"), { status: state.resultError });
        state.lastResultRequestId = options.requestId;
        return { data: state.resultData };
      },
    },
  };
}
