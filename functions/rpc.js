const RPC_TARGET_ERROR = "RPC_TARGET_URL is not configured for this Pages deployment.";

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

  if (!rpcTargetUrl) {
    return jsonResponse({ error: RPC_TARGET_ERROR }, 500);
  }

  const upstreamResponse = await fetch(rpcTargetUrl, {
    method: "POST",
    headers: {
      "content-type": context.request.headers.get("content-type") || "application/json"
    },
    body: await context.request.text()
  });

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
