import { useCallback, useEffect, useRef, useState } from "react";
import { searchTrips } from "../api/catalog";
import { ApiRequestError } from "../api/client";
import type { TripResult } from "../api/types";

export type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; trips: TripResult[] }
  | { status: "empty" }
  | { status: "error"; error: ApiRequestError };

export function useSearchTrips() {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  // Ao sair da tela, cancela a busca que ainda estiver em andamento.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const search = useCallback(
    async (
      origin: number,
      destination: number,
      date: string,
    ): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setState({ status: "loading" });
      try {
        const trips = await searchTrips(
          origin,
          destination,
          date,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setState(
          trips.length === 0
            ? { status: "empty" }
            : { status: "success", trips },
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiRequestError) {
          setState({ status: "error", error });
        } else {
          throw error;
        }
      }
    },
    [],
  );

  return { state, search };
}
