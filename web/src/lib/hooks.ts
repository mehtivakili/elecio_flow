import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { useToast } from './toast';

export function useApi<T = any>(path: string | null, key?: QueryKey) {
  return useQuery<T>({
    queryKey: key ?? [path],
    queryFn: () => api<T>(path!),
    enabled: !!path,
  });
}

/**
 * A mutation that toasts its outcome and refreshes everything that may have
 * changed. Modules are interconnected (an order touches stock, units, CRM…),
 * so after a write we simply invalidate all queries — cheap at this scale.
 */
export function useAction<TVars = any, TResult = any>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult, v: TVars) => void; onError?: (e: ApiError) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      qc.invalidateQueries();
      const msg = typeof opts.success === 'function' ? opts.success(result) : opts.success;
      if (msg) toast(msg, 'success');
      opts.onSuccess?.(result, vars);
    },
    onError: (err) => {
      if (opts.onError) opts.onError(err);
      else toast(err.message, 'error');
    },
  });
}
