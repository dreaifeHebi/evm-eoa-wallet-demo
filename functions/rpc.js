const RPC_TARGET_ERROR = "RPC_TARGET_URL is not configured for this Pages deployment.";
const ALLOWED_RPC_METHODS = new Set([
  "eth_blockNumber",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction"
]);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : {})
    }
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function validateRpcPayload(requestBody) {
  let payload;

  try {
    payload = JSON.parse(requestBody);
  } catch {
    return {
      ok: false,
      status: 400,
      body: rpcError(null, -32700, "Invalid JSON-RPC payload.")
    };
  }

  const requests = Array.isArray(payload) ? payload : [payload];

  if (requests.length === 0) {
    return {
      ok: false,
      status: 400,
      body: rpcError(null, -32600, "Empty JSON-RPC batch is not allowed.")
    };
  }

  const blocked = requests
    .map((request) => {
      const id =
        request && typeof request === "object" && "id" in request ? request.id : null;
      const method =
        request && typeof request === "object" && typeof request.method === "string"
          ? request.method
          : "";

      if (!method) {
        return rpcError(id, -32600, "JSON-RPC request must include a method.");
      }

      if (!ALLOWED_RPC_METHODS.has(method)) {
        return rpcError(id, -32601, "JSON-RPC method is not allowed by this proxy.", {
          method
        });
      }

      return null;
    })
    .filter(Boolean);

  if (blocked.length > 0) {
    return {
      ok: false,
      status: 403,
      body: Array.isArray(payload) ? blocked : blocked[0]
    };
  }

  return { ok: true };
}

export async function onRequestPost(context) {
  const rpcTargetUrl = context.env.RPC_TARGET_URL;
  const requestBody = await context.request.text();

  const validation = validateRpcPayload(requestBody);
  if (!validation.ok) {
    return jsonResponse(validation.body, validation.status);
  }

  if (!rpcTargetUrl) {
    return jsonResponse({ error: RPC_TARGET_ERROR }, 500);
  }

  let targetUrl;

  try {
    targetUrl = new URL(rpcTargetUrl);
  } catch {
    return jsonResponse({ error: "RPC_TARGET_URL must be a valid absolute URL." }, 500);
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return jsonResponse({ error: "RPC_TARGET_URL must use http or https." }, 500);
  }

  const requestUrl = new URL(context.request.url);
  if (targetUrl.hostname === requestUrl.hostname && targetUrl.pathname === requestUrl.pathname) {
    return jsonResponse({ error: "RPC_TARGET_URL must not point back to this /rpc proxy." }, 500);
  }

  let upstreamResponse;

  try {
    upstreamResponse = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": context.request.headers.get("content-type") || "application/json"
      },
      body: requestBody
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "RPC upstream fetch failed.",
        detail: errorMessage(error)
      },
      502
    );
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") || "application/json"
    }
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204 });
}
