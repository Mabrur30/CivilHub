import { useCallback, useEffect, useState } from "react";
import {
  type ClientProject,
  getErrorMessage,
  isClientProject,
} from "./clientData";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

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

  useEffect(() => {
    let isActive = true;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/projects/my-posted-projects`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!isActive) return;
        if (!response.ok || !Array.isArray(body) || !body.every(isClientProject)) {
          setError(getErrorMessage(body, "Unable to load your projects."));
          return;
        }
        setProjects(body);
      } catch {
        if (isActive) setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };
    void load();
    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { projects, isLoading, error, reload };
}
