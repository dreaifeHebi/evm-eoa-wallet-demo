const RPC_TARGET_ERROR = "RPC_TARGET_URL is not configured for this Pages deployment.";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

export async function onRequestPost(context) {
  const rpcTargetUrl = context.env.RPC_TARGET_URL;
  const requestBody = await context.request.text();

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
