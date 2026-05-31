import { useCallback, useEffect, useState } from "react"
import { apiGet } from "@/lib/api-client"

type QueryState<T> = {
  data: T | null
  error: string | null
  isLoading: boolean
  path: string
}

export function useApiQuery<T>(path: string) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    isLoading: true,
    path,
  })

  const refetch = useCallback(async () => {
    const data = await apiGet<T>(path)
    setState({ data, error: null, isLoading: false, path })
    return data
  }, [path])

  useEffect(() => {
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
  }, [path])

  return {
    ...state,
    isLoading: state.path !== path || state.isLoading,
    refetch,
  }
}
