// Talks to the SkillGuard API. Everything the UI needs to know about a failed scan
// is turned into a plain-language message here.

const API_BASE = (window.SKILLGUARD_API_BASE || "").replace(/\/$/, "");

export class ScanError extends Error {}

/**
 * Run a scan.
 * @param {{type: "paste" | "github", text: string} | {type: "upload", file: File}} input
 * @returns {Promise<object>} the risk report
 */
export async function scanSkill(input) {
  const request = requestFor(input);
  let response;
  try {
    response = await fetch(API_BASE + request.path, request.options);
  } catch (err) {
    throw new ScanError("Couldn't reach the scan service. Check your connection and try again.");
  }

  const data = await readJson(response);
  if (!response.ok) throw new ScanError(errorMessage(response.status, data));
  return data;
}

function requestFor(input) {
  if (input.type === "upload") {
    const body = new FormData();
    body.append("file", input.file);
    return { path: "/scan/file", options: { method: "POST", body } };
  }
  return {
    path: "/scan",
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_code: input.text }),
    },
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return {};
  }
}

export function errorMessage(status, data) {
  if (status === 413) return "That skill is too large to scan. Try a smaller file or repo.";
  if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(" ");
  if (typeof data.detail === "string") return data.detail;
  if (status === 503) return "The scanner isn't ready yet. Please try again later.";
  return `Scan failed (error ${status}).`;
}
