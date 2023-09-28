import { Json } from "./types";

export async function getHttpRequest(
  url: string,
  config?: RequestInit
): Promise<Response> {
  const headerConfig: RequestInit = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };
  const cfg = { ...config, ...headerConfig };
  const response = await fetch(url, cfg);
  return response;
}

export async function postHttpRequest(
  url: string,
  data?: Json,
  config?: RequestInit
): Promise<Response> {
  const headerConfig: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };
  if (data)
    headerConfig.body = JSON.stringify(data);
  const cfg = { ...config, ...headerConfig };
  const response = await fetch(url, cfg);
  return response;
}

