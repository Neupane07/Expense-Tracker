import { useCallback, useEffect, useState } from "react"
import { apiGet } from "@/lib/api-client"

type QueryState<T> = {
  data: T | null
  error: string | null
  isLoading: boolean
  path: string
}

export function useApiQuery<T>(path: string) {
  const enabled = path.length > 0
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    isLoading: enabled,
    path,
  })

  const refetch = useCallback(async () => {
    if (!enabled) {
      return null
    }

    const data = await apiGet<T>(path)
    setState({ data, error: null, isLoading: false, path })
    return data
  }, [enabled, path])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let isCurrent = true

    apiGet<T>(path)
      .then((data) => {
        if (isCurrent) {
          setState({ data, error: null, isLoading: false, path })
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setState({
            data: null,
            error: error instanceof Error ? error.message : "Unable to load data",
            isLoading: false,
            path,
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [enabled, path])

  return {
    ...state,
    isLoading: enabled ? state.path !== path || state.isLoading : false,
    refetch,
  }
}
