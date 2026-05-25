const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function apiGet<T>(path: string) {
  return apiRequest<T>(path)
}

export async function apiPostFormData<T>(path: string, formData: FormData) {
  return apiRequest<T>(path, {
    method: "POST",
    body: formData,
  })
}

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, init)

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const body = (await response.json()) as { message?: string | string[] }
      message = Array.isArray(body.message)
        ? body.message.join(", ")
        : body.message || message
    } catch {
      // Keep the generic status message when the API does not return JSON.
    }

    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}

export function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value)
    }
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ""
}
