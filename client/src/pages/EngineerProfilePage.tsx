import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "../context/AuthContext";

interface ProfilePhoto {
  url: string;
}

interface Certificate {
  _id: string;
  title: string;
  fileUrl: string;
  uploadedAt: string;
}

interface PortfolioItem {
  _id: string;
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: string;
}

interface EngineerProfile {
  bio: string;
  profilePhoto?: ProfilePhoto;
  certificates: Certificate[];
  portfolio: PortfolioItem[];
}

interface UpdateEngineerProfileBody {
  bio?: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CERTIFICATE_TYPES = [...IMAGE_TYPES, "application/pdf"];
const IMAGE_LIMIT = 5 * 1024 * 1024;
const CERTIFICATE_LIMIT = 10 * 1024 * 1024;

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const isEngineerProfile = (value: unknown): value is EngineerProfile => {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.bio === "string" &&
    (profile.profilePhoto === undefined ||
      typeof profile.profilePhoto === "object") &&
    Array.isArray(profile.certificates) &&
    Array.isArray(profile.portfolio)
  );
};

const validateFile = (
  file: File | undefined,
  allowedTypes: string[],
  limit: number,
  label: string,
): string => {
  if (!file) return `${label} file is required.`;
  if (!allowedTypes.includes(file.type))
    return `${label} must be a JPG, PNG, WEBP${label === "Certificate" ? ", or PDF" : ""}.`;
  if (file.size > limit)
    return `${label} must be ${limit / (1024 * 1024)}MB or smaller.`;
  return "";
};

export function EngineerProfilePage(): ReactElement {
  const { currentUser } = useAuth();
  const photoInput = useRef<HTMLInputElement>(null);
  const certificateInput = useRef<HTMLInputElement>(null);
  const portfolioInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<EngineerProfile | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [photoError, setPhotoError] = useState<string>("");
  const [certificateError, setCertificateError] = useState<string>("");
  const [portfolioError, setPortfolioError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPhotoUploading, setIsPhotoUploading] = useState<boolean>(false);
  const [isCertificateUploading, setIsCertificateUploading] =
    useState<boolean>(false);
  const [isPortfolioUploading, setIsPortfolioUploading] =
    useState<boolean>(false);
  const [isBioSaving, setIsBioSaving] = useState<boolean>(false);
  const [certificateTitle, setCertificateTitle] = useState<string>("");
  const [portfolioTitle, setPortfolioTitle] = useState<string>("");
  const [portfolioDescription, setPortfolioDescription] = useState<string>("");
  const [bioDraft, setBioDraft] = useState<string>("");
  const [bioError, setBioError] = useState<string>("");
  const [bioSaved, setBioSaved] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadProfile = async (): Promise<void> => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/engineers/me`, {
        credentials: "include",
      });
      const body: unknown = await response.json();
      if (!response.ok || !isEngineerProfile(body)) {
        setLoadError(
          getErrorMessage(body, "Unable to load your engineer profile."),
        );
        return;
      }
      setProfile(body);
      setBioDraft(body.bio);
    } catch {
      setLoadError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const uploadPhoto = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    setPhotoError("");
    const validationError = validateFile(
      file,
      IMAGE_TYPES,
      IMAGE_LIMIT,
      "Profile photo",
    );
    if (validationError) {
      setPhotoError(validationError);
      return;
    }
    setIsPhotoUploading(true);
    const formData = new FormData();
    formData.append("photo", file as File);
    try {
      const response = await fetch(`${API_BASE_URL}/api/engineers/me/photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setPhotoError(
          getErrorMessage(body, "Unable to upload your profile photo."),
        );
        return;
      }
      await loadProfile();
    } catch {
      setPhotoError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsPhotoUploading(false);
      event.target.value = "";
    }
  };

  const uploadCertificate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const file = certificateInput.current?.files?.[0];
    setCertificateError("");
    const validationError = validateFile(
      file,
      CERTIFICATE_TYPES,
      CERTIFICATE_LIMIT,
      "Certificate",
    );
    if (validationError || !certificateTitle.trim()) {
      setCertificateError(validationError || "Certificate title is required.");
      return;
    }
    setIsCertificateUploading(true);
    const formData = new FormData();
    formData.append("title", certificateTitle.trim());
    formData.append("certificate", file as File);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/engineers/me/certificates`,
        { method: "POST", credentials: "include", body: formData },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setCertificateError(
          getErrorMessage(body, "Unable to upload the certificate."),
        );
        return;
      }
      setCertificateTitle("");
      if (certificateInput.current) certificateInput.current.value = "";
      await loadProfile();
    } catch {
      setCertificateError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsCertificateUploading(false);
    }
  };

  const uploadPortfolio = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const file = portfolioInput.current?.files?.[0];
    setPortfolioError("");
    const validationError = validateFile(
      file,
      IMAGE_TYPES,
      IMAGE_LIMIT,
      "Portfolio image",
    );
    if (
      validationError ||
      !portfolioTitle.trim() ||
      !portfolioDescription.trim()
    ) {
      setPortfolioError(
        validationError || "Portfolio title and description are required.",
      );
      return;
    }
    setIsPortfolioUploading(true);
    const formData = new FormData();
    formData.append("title", portfolioTitle.trim());
    formData.append("description", portfolioDescription.trim());
    formData.append("image", file as File);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/engineers/me/portfolio`,
        { method: "POST", credentials: "include", body: formData },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setPortfolioError(
          getErrorMessage(body, "Unable to upload the portfolio image."),
        );
        return;
      }
      setPortfolioTitle("");
      setPortfolioDescription("");
      if (portfolioInput.current) portfolioInput.current.value = "";
      await loadProfile();
    } catch {
      setPortfolioError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsPortfolioUploading(false);
    }
  };

  const deleteItem = async (
    kind: "certificates" | "portfolio",
    id: string,
  ): Promise<void> => {
    setDeletingId(id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/engineers/me/${kind}/${id}`,
        { method: "DELETE", credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = getErrorMessage(body, "Unable to remove this file.");
        if (kind === "certificates") setCertificateError(message);
        else setPortfolioError(message);
        return;
      }
      await loadProfile();
    } catch {
      const message = "Unable to connect to CivilHub. Please try again.";
      if (kind === "certificates") setCertificateError(message);
      else setPortfolioError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const saveBio = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBioSaved(false);
    setBioError("");

    const payload: UpdateEngineerProfileBody = {
      bio: bioDraft,
    };

    setIsBioSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/engineers/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json();

      if (!response.ok || !isEngineerProfile(body)) {
        setBioError(getErrorMessage(body, "Unable to save your bio."));
        return;
      }

      setProfile(body);
      setBioDraft(body.bio);
      setBioSaved(true);
      window.setTimeout(() => setBioSaved(false), 3500);
    } catch {
      setBioError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsBioSaving(false);
    }
  };

  const initials = currentUser?.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (isLoading)
    return (
      <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-8 text-white/50">
        Loading profile...
      </div>
    );
  if (loadError)
    return (
      <section
        className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
        role="alert"
      >
        <p className="text-sm text-red-200">{loadError}</p>
        <button
          type="button"
          onClick={() => void loadProfile()}
          className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary"
        >
          Try again
        </button>
      </section>
    );

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Professional presence
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Engineer Profile
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Keep your credentials and completed work ready for prospective
          clients.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {profile?.profilePhoto?.url ? (
            <img
              src={profile.profilePhoto.url}
              alt="Profile"
              className="h-28 w-28 rounded-full object-cover ring-2 ring-primary/50"
            />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/15 text-3xl font-semibold text-primary ring-2 ring-primary/40">
              {initials}
            </div>
          )}
          <div>
            <h2 className="font-heading text-2xl font-bold text-white">
              {currentUser?.name}
            </h2>
            <p className="mt-1 text-sm text-white/50">{currentUser?.email}</p>
            <input
              ref={photoInput}
              id="profile-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void uploadPhoto(event)}
              className="sr-only"
            />
            <label
              htmlFor="profile-photo"
              className="mt-4 inline-block cursor-pointer rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-glow"
            >
              {isPhotoUploading ? "Uploading..." : "Change photo"}
            </label>
            {photoError ? (
              <p className="mt-3 text-sm text-red-300" role="alert">
                {photoError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <form onSubmit={(event) => void saveBio(event)} className="space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="engineer-bio"
              className="text-sm font-semibold text-white/80"
            >
              Bio <span className="font-normal text-white/40">(optional)</span>
            </label>
            <span className="text-xs text-white/45">{bioDraft.length}/500</span>
          </div>
          <textarea
            id="engineer-bio"
            rows={4}
            maxLength={500}
            value={bioDraft}
            onChange={(event) => {
              setBioDraft(event.target.value);
              setBioSaved(false);
              setBioError("");
            }}
            className="form-input"
            placeholder="Describe your expertise, sector experience, or delivery strengths"
          />
          <button
            type="submit"
            disabled={isBioSaving}
            className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {isBioSaving ? "Saving..." : "Save bio"}
          </button>
          {bioSaved ? (
            <p role="status" className="text-sm text-emerald-300">
              Bio saved.
            </p>
          ) : null}
          {bioError ? (
            <p role="alert" className="text-sm text-red-300">
              {bioError}
            </p>
          ) : null}
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <div className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-heading text-2xl font-bold text-white">
            Certificates
          </h2>
          <div className="mt-5 space-y-3">
            {profile?.certificates.length ? (
              profile.certificates.map((certificate) => (
                <article
                  key={certificate._id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-void/50 p-4"
                >
                  <a
                    href={certificate.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-primary hover:text-glow"
                  >
                    {certificate.title}
                  </a>
                  <button
                    type="button"
                    disabled={deletingId === certificate._id}
                    onClick={() =>
                      void deleteItem("certificates", certificate._id)
                    }
                    className="text-xs font-semibold text-white/50 hover:text-red-300"
                  >
                    {deletingId === certificate._id ? "Removing..." : "Delete"}
                  </button>
                </article>
              ))
            ) : (
              <p className="text-sm text-white/50">
                No certificates uploaded yet.
              </p>
            )}
          </div>
          <form
            onSubmit={(event) => void uploadCertificate(event)}
            className="mt-6 space-y-3 border-t border-white/10 pt-6"
          >
            <input
              value={certificateTitle}
              onChange={(event) => setCertificateTitle(event.target.value)}
              placeholder="Certificate title"
              className="form-input"
            />
            <input
              ref={certificateInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white"
            />
            <button
              type="submit"
              disabled={isCertificateUploading}
              className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isCertificateUploading ? "Uploading..." : "Add Certificate"}
            </button>
            {certificateError ? (
              <p className="text-sm text-red-300" role="alert">
                {certificateError}
              </p>
            ) : null}
          </form>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface p-6">
          <h2 className="font-heading text-2xl font-bold text-white">
            Portfolio
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {profile?.portfolio.length ? (
              profile.portfolio.map((item) => (
                <article
                  key={item._id}
                  className="overflow-hidden rounded-xl border border-white/10 bg-void/50"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <button
                        type="button"
                        disabled={deletingId === item._id}
                        onClick={() => void deleteItem("portfolio", item._id)}
                        className="text-xs text-white/50 hover:text-red-300"
                      >
                        {deletingId === item._id ? "Removing..." : "Delete"}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-white/55">
                      {item.description}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-white/50">
                No portfolio items uploaded yet.
              </p>
            )}
          </div>
          <form
            onSubmit={(event) => void uploadPortfolio(event)}
            className="mt-6 space-y-3 border-t border-white/10 pt-6"
          >
            <input
              value={portfolioTitle}
              onChange={(event) => setPortfolioTitle(event.target.value)}
              placeholder="Project title"
              className="form-input"
            />
            <textarea
              value={portfolioDescription}
              onChange={(event) => setPortfolioDescription(event.target.value)}
              placeholder="Describe your contribution"
              rows={3}
              className="form-input"
            />
            <input
              ref={portfolioInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white"
            />
            <button
              type="submit"
              disabled={isPortfolioUploading}
              className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPortfolioUploading ? "Uploading..." : "Add Portfolio Item"}
            </button>
            {portfolioError ? (
              <p className="text-sm text-red-300" role="alert">
                {portfolioError}
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
