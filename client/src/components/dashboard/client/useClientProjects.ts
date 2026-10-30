import { useCallback, useEffect, useState } from "react";
import {
  type ClientProject,
  getErrorMessage,
  isClientProject,
} from "./clientData";
import { API_BASE_URL } from "../../../lib/apiBase";
import { useRealtime } from "../../../realtime/useRealtime";
import { useVisibleInterval } from "../../../realtime/useVisibleInterval";

interface ClientProjectsState {
  projects: ClientProject[];
  isLoading: boolean;
  error: string;
  reload: () => void;
}

/** The client's projects that aren't finished yet (finished ones live in History). */
export function useClientProjects(): ClientProjectsState {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [reloadKey, setReloadKey] = useState<number>(0);

  const load = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    const silent = options?.silent === true;
    if (!silent) { setIsLoading(true); setError(""); }
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/projects/my-posted-projects`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!response.ok || !Array.isArray(body) || !body.every(isClientProject)) {
          if (!silent) setError(getErrorMessage(body, "Unable to load your projects."));
          return;
        }
        setProjects(body);
      } catch {
        if (!silent) setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (!silent) setIsLoading(false);
      }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  useRealtime(["dashboard", "projects"], () => { void load({ silent: true }); }, { debounceMs: 1500, minIntervalMs: 5000 });
  useVisibleInterval(() => { void load({ silent: true }); }, 60000);
  return { projects, isLoading, error, reload };
}
