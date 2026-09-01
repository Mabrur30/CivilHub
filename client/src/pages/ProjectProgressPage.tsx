import { type ReactElement, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type ProjectPhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "delayed";

type PhasePlanStatus =
  | "not_created"
  | "draft"
  | "pending_client_approval"
  | "approved";

type PaymentPlan = "phase_by_phase" | "full_upfront";

interface ProjectPhase {
  id: string;
  name: string;
  description?: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate: string | null;
  completedAt: string | null;
  price?: number;
  paymentStatus?: string;
  paidAt?: string;
  updatedAt: string;
}

interface PhasePlanPhase {
  id: string;
  title: string;
  description: string;
  price: number;
  estimatedDueDate: string;
  order: number;
  paymentStatus: string;
}

interface PhasePlan {
  projectId: string;
  phasePlanStatus: PhasePlanStatus;
  totalAgreedValue?: number;
  paymentPlan?: PaymentPlan | null;
  advanceRequiredAmount?: number | null;
  advancePaid: boolean;
  advancePaidAt?: string;
  phases: PhasePlanPhase[];
}

interface ProjectProgressResponse {
  project: {
    id: string;
    name: string;
    status: string;
    clientId: string | null;
    assignedEngineerId: string | null;
    currentPhaseName: string;
    progressPercentage: number;
    nextMilestone: string;
    nextMilestoneDueDate: string | null;
  };
  phases: ProjectPhase[];
  canUpdate: boolean;
}

interface ReviewSummary {
  id: string;
  projectId: string;
  client: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
  };
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

interface ReviewEligibilityResponse {
  canReview: boolean;
  alreadyReviewed: boolean;
  reason?: string;
  review?: ReviewSummary;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const statusOptions: Array<{
  value: ProjectPhaseStatus;
  label: string;
}> = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "completed", label: "Completed" },
  { value: "delayed", label: "Delayed" },
];

const statusBadgeClass: Record<ProjectPhaseStatus, string> = {
  not_started: "border-white/20 bg-white/10 text-white/70",
  in_progress: "border-sky-300/40 bg-sky-300/10 text-sky-200",
  awaiting_approval: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  completed: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200",
  delayed: "border-red-300/40 bg-red-300/10 text-red-200",
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") {
      return body.message;
    }
  }
  return "An error occurred.";
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
};

const formatCurrency = (value: number): string => {
  return `$${value.toFixed(2)}`;
};

type SummaryIconName = "phase" | "progress" | "milestone";

const SummaryIcon = ({ name }: { name: SummaryIconName }): ReactElement => {
  if (name === "progress") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19V5M4 19h16" />
        <path d="m7 15 3-4 3 2 5-7" />
      </svg>
    );
  }

  if (name === "milestone") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 21V4" />
        <path d="M6 5c4-3 8 3 12 0v9c-4 3-8-3-12 0" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
};

const StatusIcon = ({
  status,
}: {
  status: ProjectPhaseStatus;
}): ReactElement => {
  if (status === "completed") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (status === "in_progress") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (status === "awaiting_approval") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 3.5 7.5v5c0 4 3.6 7.2 8.5 8.5 4.9-1.3 8.5-4.5 8.5-8.5v-5L12 3Z" />
        <path d="M12 8v4M12 15h.01" />
      </svg>
    );
  }

  if (status === "delayed") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12 4 9 16H3L12 4Z" />
        <path d="M12 9v5M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
};

const CheckIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 12 4 4L19 6" />
  </svg>
);

const CardAccentIcon = ({ paid }: { paid: boolean }): ReactElement => (
  <span
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${paid ? "bg-emerald-300/10 text-emerald-300" : "bg-primary/10 text-primary"}`}
  >
    {paid ? <CheckIcon /> : <span className="text-lg font-semibold">$</span>}
  </span>
);

export function ProjectProgressPage(): ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentUser } = useAuth();

  const [projectProgress, setProjectProgress] =
    useState<ProjectProgressResponse | null>(null);
  const [phasePlan, setPhasePlan] = useState<PhasePlan | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [updatingPhaseId, setUpdatingPhaseId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string>("");

  // Phase plan creation state
  const [phasePlanFormData, setPhasePlanFormData] = useState<PhasePlanPhase[]>([
    {
      id: "new-0",
      title: "",
      description: "",
      price: 0,
      estimatedDueDate: "",
      order: 0,
      paymentStatus: "unpaid",
    },
  ]);
  const [phasePlanErrors, setPhasePlanErrors] = useState<string[]>([]);
  const [isSubmittingPhasePlan, setIsSubmittingPhasePlan] =
    useState<boolean>(false);

  // Payment state
  const [selectedPaymentPlan, setSelectedPaymentPlan] =
    useState<PaymentPlan>("phase_by_phase");
  const [isProcessingPayment, setIsProcessingPayment] =
    useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string>("");
  const [reviewEligibility, setReviewEligibility] =
    useState<ReviewEligibilityResponse | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string>("");
  const [reviewSuccess, setReviewSuccess] = useState<boolean>(false);

  // Rejection feedback
  const [rejectFeedback, setRejectFeedback] = useState<string>("");
  const [isRejectingPlan, setIsRejectingPlan] = useState<boolean>(false);

  const backPath = useMemo(() => {
    if (currentUser?.role === "client") {
      return "/dashboard/client/projects";
    }
    return "/dashboard/engineer/projects";
  }, [currentUser?.role]);

  const loadData = async (): Promise<void> => {
    if (!projectId) {
      setError("Project ID is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const [progressRes, planRes, reviewRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/projects/${projectId}/progress`, {
          credentials: "include",
        }),
        fetch(`${API_BASE_URL}/api/projects/${projectId}/phase-plan`, {
          credentials: "include",
        }),
        currentUser?.role === "client"
          ? fetch(`${API_BASE_URL}/api/projects/${projectId}/can-review`, {
              credentials: "include",
            })
          : Promise.resolve(null),
      ]);

      if (!progressRes.ok) {
        const errorBody: unknown = await progressRes.json();
        setError(getErrorMessage(errorBody));
        setProjectProgress(null);
        return;
      }

      const progressData: unknown = await progressRes.json();
      setProjectProgress(progressData as ProjectProgressResponse);

      if (planRes.ok) {
        const planData: unknown = await planRes.json();
        setPhasePlan(planData as PhasePlan);
      }

      if (reviewRes?.ok) {
        const reviewData: unknown = await reviewRes.json();
        setReviewEligibility(reviewData as ReviewEligibilityResponse);
      } else if (currentUser?.role !== "client") {
        setReviewEligibility(null);
      }
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
      setProjectProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [currentUser?.role, projectId]);

  const handleUpdatePhase = async (
    phaseId: string,
    status: ProjectPhaseStatus,
  ): Promise<void> => {
    if (!projectId) {
      return;
    }

    setUpdatingPhaseId(phaseId);
    setUpdateError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phases/${phaseId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      const body: unknown = await response.json();
      if (!response.ok) {
        setUpdateError(getErrorMessage(body));
        return;
      }

      await loadData();
    } catch {
      setUpdateError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setUpdatingPhaseId(null);
    }
  };

  const handleAddPhase = (): void => {
    setPhasePlanFormData([
      ...phasePlanFormData,
      {
        id: `new-${Date.now()}`,
        title: "",
        description: "",
        price: 0,
        estimatedDueDate: "",
        order: phasePlanFormData.length,
        paymentStatus: "unpaid",
      },
    ]);
  };

  const handleRemovePhase = (index: number): void => {
    if (phasePlanFormData.length > 1) {
      setPhasePlanFormData(phasePlanFormData.filter((_, i) => i !== index));
    }
  };

  const handlePhaseChange = (
    index: number,
    field: keyof PhasePlanPhase,
    value: unknown,
  ): void => {
    const updated = [...phasePlanFormData];
    if (field === "price") {
      updated[index] = { ...updated[index], [field]: Number(value) };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setPhasePlanFormData(updated);
  };

  const validatePhasePlan = (): boolean => {
    const errors: string[] = [];
    let totalPrice = 0;

    phasePlanFormData.forEach((phase, index) => {
      if (!phase.title.trim()) {
        errors.push(`Phase ${index + 1}: Title is required`);
      }
      if (!phase.description.trim()) {
        errors.push(`Phase ${index + 1}: Description is required`);
      }
      if (phase.price <= 0) {
        errors.push(`Phase ${index + 1}: Price must be greater than 0`);
      }
      if (!phase.estimatedDueDate) {
        errors.push(`Phase ${index + 1}: Due date is required`);
      }
      totalPrice += phase.price;
    });

    const totalAgreedValue = phasePlan?.totalAgreedValue || 0;
    if (Math.abs(totalPrice - totalAgreedValue) > 0.01) {
      errors.push(
        `Phase total ($${totalPrice.toFixed(2)}) must equal project value ($${totalAgreedValue.toFixed(2)})`,
      );
    }

    setPhasePlanErrors(errors);
    return errors.length === 0;
  };

  const handleSaveDraft = async (): Promise<void> => {
    if (!projectId || !validatePhasePlan()) {
      return;
    }

    setIsSubmittingPhasePlan(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phase-plan`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phases: phasePlanFormData.map((p) => ({
              title: p.title,
              description: p.description,
              price: p.price,
              estimatedDueDate: p.estimatedDueDate,
              order: phasePlanFormData.indexOf(p),
            })),
          }),
        },
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        setPhasePlanErrors([getErrorMessage(errorBody)]);
        return;
      }

      await loadData();
      setPhasePlanErrors([]);
    } catch {
      setPhasePlanErrors(["Unable to save draft. Please try again."]);
    } finally {
      setIsSubmittingPhasePlan(false);
    }
  };

  const handleSubmitForApproval = async (): Promise<void> => {
    if (!projectId || !validatePhasePlan()) {
      return;
    }

    setIsSubmittingPhasePlan(true);
    try {
      // First save draft
      const saveDraftRes = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phase-plan`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phases: phasePlanFormData.map((p) => ({
              title: p.title,
              description: p.description,
              price: p.price,
              estimatedDueDate: p.estimatedDueDate,
              order: phasePlanFormData.indexOf(p),
            })),
          }),
        },
      );

      if (!saveDraftRes.ok) {
        const errorBody: unknown = await saveDraftRes.json();
        setPhasePlanErrors([getErrorMessage(errorBody)]);
        setIsSubmittingPhasePlan(false);
        return;
      }

      // Then submit for approval
      const submitRes = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phase-plan/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!submitRes.ok) {
        const errorBody: unknown = await submitRes.json();
        setPhasePlanErrors([getErrorMessage(errorBody)]);
        return;
      }

      await loadData();
      setPhasePlanErrors([]);
    } catch {
      setPhasePlanErrors(["Unable to submit plan. Please try again."]);
    } finally {
      setIsSubmittingPhasePlan(false);
    }
  };

  const handleApprovePlan = async (): Promise<void> => {
    if (!projectId) {
      return;
    }

    setIsSubmittingPhasePlan(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phase-plan/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentPlan: selectedPaymentPlan }),
        },
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        setPhasePlanErrors([getErrorMessage(errorBody)]);
        return;
      }

      await loadData();
      setPhasePlanErrors([]);
    } catch {
      setPhasePlanErrors(["Unable to approve plan. Please try again."]);
    } finally {
      setIsSubmittingPhasePlan(false);
    }
  };

  const handleRejectPlan = async (): Promise<void> => {
    if (!projectId || !rejectFeedback.trim()) {
      return;
    }

    setIsRejectingPlan(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phase-plan/reject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: rejectFeedback }),
        },
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        setPhasePlanErrors([getErrorMessage(errorBody)]);
        return;
      }

      await loadData();
      setRejectFeedback("");
      setPhasePlanErrors([]);
    } catch {
      setPhasePlanErrors(["Unable to reject plan. Please try again."]);
    } finally {
      setIsRejectingPlan(false);
    }
  };

  const handlePayAdvance = async (): Promise<void> => {
    if (!projectId) {
      return;
    }

    setIsProcessingPayment(true);
    setPaymentError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/payments/advance`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        setPaymentError(getErrorMessage(errorBody));
        return;
      }

      await loadData();
    } catch {
      setPaymentError("Unable to process payment. Please try again.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePayForPhase = async (phaseId: string): Promise<void> => {
    if (!projectId) {
      return;
    }

    setIsProcessingPayment(true);
    setPaymentError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phases/${phaseId}/payments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        setPaymentError(getErrorMessage(errorBody));
        return;
      }

      await loadData();
    } catch {
      setPaymentError("Unable to process payment. Please try again.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePayFullRemaining = async (): Promise<void> => {
    if (!projectId) {
      return;
    }

    setIsProcessingPayment(true);
    setPaymentError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/payments/full-remaining`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        const errorBody: unknown = await response.json();
        setPaymentError(getErrorMessage(errorBody));
        return;
      }

      await loadData();
    } catch {
      setPaymentError("Unable to process payment. Please try again.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleSubmitReview = async (): Promise<void> => {
    if (!projectId || reviewRating === 0 || !reviewText.trim()) {
      setReviewError("Choose a rating and write a review before submitting.");
      return;
    }

    setIsSubmittingReview(true);
    setReviewError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          rating: reviewRating,
          reviewText: reviewText.trim(),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setReviewError(getErrorMessage(body));
        return;
      }

      const createdReview = (body as { review?: ReviewSummary }).review;
      setReviewEligibility({
        canReview: false,
        alreadyReviewed: true,
        review: createdReview,
      });
      setReviewSuccess(true);
    } catch {
      setReviewError("Unable to submit your review. Please try again.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const totalPhasePrice = phasePlanFormData.reduce(
    (sum, p) => sum + p.price,
    0,
  );
  const totalAgreedValue = phasePlan?.totalAgreedValue || 0;
  const pricesMatch = Math.abs(totalPhasePrice - totalAgreedValue) < 0.01;
  const completedPhaseCount =
    projectProgress?.phases.filter((phase) => phase.status === "completed")
      .length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to={backPath}
        className="text-sm font-semibold text-primary hover:text-glow"
      >
        &lt;- Back to projects
      </Link>

      {isLoading ? (
        <section className="animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
          <div className="h-4 w-1/4 rounded bg-white/10" />
          <div className="mt-4 h-8 w-2/3 rounded bg-white/10" />
          <div className="mt-8 h-3 w-full rounded bg-white/10" />
        </section>
      ) : error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : projectProgress && phasePlan ? (
        <>
          <section className="rounded-2xl border border-white/10 bg-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.18)] sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Project progress
            </p>
            <h1 className="mt-3 font-heading text-4xl font-bold text-white">
              {projectProgress.project.name}
            </h1>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="group rounded-xl border border-white/10 bg-void/45 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                    Current phase
                  </p>
                  <span className="text-primary transition-transform duration-200 group-hover:scale-110">
                    <SummaryIcon name="phase" />
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-white/90">
                  {projectProgress.project.currentPhaseName}
                </p>
              </div>
              <div className="group rounded-xl border border-white/10 bg-void/45 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                    Progress
                  </p>
                  <span className="text-primary transition-transform duration-200 group-hover:scale-110">
                    <SummaryIcon name="progress" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-white">
                  {projectProgress.project.progressPercentage}%
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{
                      width: `${projectProgress.project.progressPercentage}%`,
                    }}
                  />
                </div>
              </div>
              <div className="group rounded-xl border border-white/10 bg-void/45 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                    Next milestone
                  </p>
                  <span className="text-primary transition-transform duration-200 group-hover:scale-110">
                    <SummaryIcon name="milestone" />
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-white/90">
                  {projectProgress.project.nextMilestone}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  Due {formatDate(projectProgress.project.nextMilestoneDueDate)}
                </p>
              </div>
            </div>
          </section>

          {currentUser?.role === "client" && reviewEligibility?.canReview && (
            <section className="rounded-2xl border border-primary/35 bg-primary/[0.06] p-6 shadow-[0_18px_50px_rgba(227,63,63,0.1)] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Project complete
              </p>
              <h2 className="mt-2 font-heading text-2xl font-bold text-white">
                Celebrate the work with a review
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Share a thoughtful note about your experience working with the
                engineer.
              </p>
              <div className="mt-5">
                <p className="text-sm font-semibold text-white">Your rating</p>
                <div className="mt-2 flex gap-1" aria-label="Choose a rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      onClick={() => setReviewRating(value)}
                      className={`text-3xl leading-none transition-all duration-150 hover:scale-110 ${value <= reviewRating ? "text-amber-300" : "text-white/20 hover:text-amber-200/70"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={reviewText}
                onChange={(event) =>
                  setReviewText(event.target.value.slice(0, 1000))
                }
                placeholder="What stood out about the delivery?"
                rows={4}
                maxLength={1000}
                className="mt-4 w-full rounded-xl border border-white/15 bg-void/50 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors focus:border-primary/60"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-white/45">
                  {reviewText.length}/1000
                </p>
                <button
                  type="button"
                  onClick={() => void handleSubmitReview()}
                  disabled={isSubmittingReview}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmittingReview ? "Submitting..." : "Submit Review"}
                </button>
              </div>
              {reviewError && (
                <p className="mt-3 text-sm text-red-200" role="alert">
                  {reviewError}
                </p>
              )}
            </section>
          )}

          {currentUser?.role === "client" &&
            reviewEligibility?.alreadyReviewed &&
            reviewEligibility.review && (
              <section className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.04] p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  {reviewSuccess ? "Review submitted" : "Your review"}
                </p>
                <div className="mt-3 flex items-center gap-1 text-amber-300">
                  {Array.from({ length: 5 }, (_, index) => (
                    <span
                      key={index}
                      className={
                        index < reviewEligibility.review!.rating
                          ? ""
                          : "text-white/15"
                      }
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-white/75">
                  {reviewEligibility.review.reviewText}
                </p>
                <p className="mt-3 text-xs text-white/40">
                  Submitted {formatDate(reviewEligibility.review.createdAt)}
                </p>
              </section>
            )}

          {/* Phase Plan Section - Engineer View */}
          {currentUser?.role === "engineer" &&
            (phasePlan.phasePlanStatus === "not_created" ||
              phasePlan.phasePlanStatus === "draft") && (
              <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
                <h2 className="font-heading text-2xl font-bold text-white">
                  Build Phase Plan
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  Create a detailed phase plan. Total price must equal{" "}
                  {formatCurrency(totalAgreedValue)}.
                </p>

                {phasePlanErrors.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-4">
                    <ul className="space-y-1 text-sm text-red-200">
                      {phasePlanErrors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  {phasePlanFormData.map((phase, index) => (
                    <div
                      key={phase.id}
                      className="rounded-lg border border-white/10 bg-void/45 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                          Phase {index + 1}
                        </h3>
                        {phasePlanFormData.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhase(index)}
                            className="text-xs text-red-300 hover:text-red-200"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          placeholder="Phase title"
                          value={phase.title}
                          onChange={(e) =>
                            handlePhaseChange(index, "title", e.target.value)
                          }
                          className="rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition-colors hover:border-white/20 focus:border-primary/50"
                        />
                        <input
                          type="number"
                          placeholder="Price"
                          value={phase.price || ""}
                          onChange={(e) =>
                            handlePhaseChange(index, "price", e.target.value)
                          }
                          className="rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition-colors hover:border-white/20 focus:border-primary/50"
                        />
                        <textarea
                          placeholder="Description"
                          value={phase.description}
                          onChange={(e) =>
                            handlePhaseChange(
                              index,
                              "description",
                              e.target.value,
                            )
                          }
                          rows={2}
                          className="sm:col-span-2 rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition-colors hover:border-white/20 focus:border-primary/50"
                        />
                        <input
                          type="date"
                          value={phase.estimatedDueDate}
                          onChange={(e) =>
                            handlePhaseChange(
                              index,
                              "estimatedDueDate",
                              e.target.value,
                            )
                          }
                          className="sm:col-span-2 rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition-colors hover:border-white/20 focus:border-primary/50"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                        Total phases price
                      </p>
                      <p
                        className={`mt-1 text-lg font-bold ${
                          pricesMatch ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {formatCurrency(totalPhasePrice)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                        Project value
                      </p>
                      <p className="mt-1 text-lg font-bold text-white">
                        {formatCurrency(totalAgreedValue)}
                      </p>
                    </div>
                  </div>
                  {!pricesMatch && (
                    <p className="mt-3 text-xs text-amber-300">
                      Prices must match exactly to submit for approval
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={handleAddPhase}
                    disabled={isSubmittingPhasePlan}
                    className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    + Add Phase
                  </button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void handleSaveDraft()}
                      disabled={isSubmittingPhasePlan}
                      className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                    >
                      {isSubmittingPhasePlan ? "Saving..." : "Save Draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmitForApproval()}
                      disabled={isSubmittingPhasePlan || !pricesMatch}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSubmittingPhasePlan
                        ? "Submitting..."
                        : "Submit for Approval"}
                    </button>
                  </div>
                </div>
              </section>
            )}

          {/* Phase Plan Approval Section - Client View */}
          {currentUser?.role === "client" &&
            phasePlan.phasePlanStatus === "pending_client_approval" && (
              <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
                <h2 className="font-heading text-2xl font-bold text-white">
                  Approve Phase Plan
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  The engineer has submitted a phase plan for your review.
                  Please select a payment plan and approve.
                </p>

                {phasePlanErrors.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-4">
                    <ul className="space-y-1 text-sm text-red-200">
                      {phasePlanErrors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Phase List */}
                <div className="mt-6 space-y-3">
                  {phasePlan.phases.map((phase) => (
                    <div
                      key={phase.id}
                      className="rounded-lg border border-white/10 bg-void/45 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-white">
                            {phase.title}
                          </h3>
                          <p className="mt-1 text-xs text-white/60">
                            {phase.description}
                          </p>
                          <p className="mt-2 text-xs text-white/50">
                            Due {formatDate(phase.estimatedDueDate)}
                          </p>
                        </div>
                        <div className="ml-4 text-right">
                          <p className="text-sm font-bold text-primary">
                            {formatCurrency(phase.price)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Payment Plan Selection */}
                <div className="mt-6">
                  <p className="text-sm font-semibold text-white">
                    Payment Plan
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentPlan("phase_by_phase")}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        selectedPaymentPlan === "phase_by_phase"
                          ? "border-primary bg-primary/10"
                          : "border-white/10 bg-void/45 hover:border-white/20"
                      }`}
                    >
                      <p className="font-semibold text-white">
                        Pay Phase by Phase
                      </p>
                      <p className="mt-1 text-xs text-white/60">
                        Pay for each phase as it completes
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentPlan("full_upfront")}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        selectedPaymentPlan === "full_upfront"
                          ? "border-primary bg-primary/10"
                          : "border-white/10 bg-void/45 hover:border-white/20"
                      }`}
                    >
                      <p className="font-semibold text-white">Full Upfront</p>
                      <p className="mt-1 text-xs text-white/60">
                        Pay full amount (20% advance + 80% later)
                      </p>
                    </button>
                  </div>
                </div>

                {/* Rejection Feedback */}
                <div className="mt-6">
                  <label className="block text-sm font-semibold text-white">
                    Or request changes
                  </label>
                  <textarea
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    placeholder="Describe what needs to change..."
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-sm text-white placeholder-white/40 outline-none transition-colors hover:border-white/20 focus:border-primary/50"
                  />
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => void handleRejectPlan()}
                    disabled={
                      isRejectingPlan ||
                      isSubmittingPhasePlan ||
                      !rejectFeedback.trim()
                    }
                    className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                  >
                    {isRejectingPlan ? "Sending..." : "Request Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprovePlan()}
                    disabled={isSubmittingPhasePlan}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSubmittingPhasePlan ? "Approving..." : "Approve Plan"}
                  </button>
                </div>
              </section>
            )}

          {/* Payment Section - When Plan is Approved */}
          {phasePlan.phasePlanStatus === "approved" && (
            <section className="rounded-2xl border border-white/10 bg-surface p-6 shadow-[0_18px_50px_rgba(0,0,0,0.16)] sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="text-xl font-semibold">$</span>
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Financial checkpoints
                  </p>
                  <h2 className="mt-1 font-heading text-2xl font-bold text-white">
                    Payments
                  </h2>
                </div>
              </div>

              {paymentError && (
                <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-4">
                  <p className="text-sm text-red-200">{paymentError}</p>
                </div>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Advance Payment */}
                <div
                  className={`rounded-xl border p-5 transition-all duration-200 ${phasePlan.advancePaid ? "border-emerald-300/25 bg-emerald-300/[0.04]" : "border-primary/35 bg-primary/[0.045] shadow-[inset_3px_0_0_rgba(227,63,63,0.85)]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                      Advance Payment
                    </p>
                    <CardAccentIcon paid={phasePlan.advancePaid} />
                  </div>
                  <p className="mt-2 text-xl font-bold text-white">
                    {formatCurrency(phasePlan.advanceRequiredAmount || 0)}
                  </p>
                  <p
                    className={`mt-2 flex items-center gap-1.5 text-xs ${phasePlan.advancePaid ? "text-emerald-200" : "text-white/55"}`}
                  >
                    {phasePlan.advancePaid && <CheckIcon />}
                    {phasePlan.advancePaid
                      ? "Paid"
                      : "Required before work begins"}
                  </p>
                  {!phasePlan.advancePaid && currentUser?.role === "client" && (
                    <button
                      type="button"
                      onClick={() => void handlePayAdvance()}
                      disabled={isProcessingPayment}
                      className="mt-4 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(227,63,63,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_12px_24px_rgba(227,63,63,0.3)] active:translate-y-0 disabled:opacity-50"
                    >
                      {isProcessingPayment
                        ? "Processing..."
                        : "Pay Advance (Mock)"}
                    </button>
                  )}
                </div>

                {/* Remaining Payment */}
                {phasePlan.paymentPlan === "full_upfront" && (
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.035] p-5 transition-all duration-200 hover:border-primary/40">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                        Remaining Balance
                      </p>
                      <CardAccentIcon paid={false} />
                    </div>
                    <p className="mt-2 text-xl font-bold text-white">
                      {formatCurrency(
                        (phasePlan.totalAgreedValue || 0) -
                          (phasePlan.advanceRequiredAmount || 0),
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      {phasePlan.advancePaid
                        ? "Due before final phase completion"
                        : "Pay after advance"}
                    </p>
                    {phasePlan.advancePaid &&
                      currentUser?.role === "client" && (
                        <button
                          type="button"
                          onClick={() => void handlePayFullRemaining()}
                          disabled={isProcessingPayment}
                          className="mt-4 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(227,63,63,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_12px_24px_rgba(227,63,63,0.3)] active:translate-y-0 disabled:opacity-50"
                        >
                          {isProcessingPayment
                            ? "Processing..."
                            : "Pay Remaining (Mock)"}
                        </button>
                      )}
                  </div>
                )}
              </div>

              {currentUser?.role === "client" && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-sky-300/20 bg-sky-300/[0.045] p-4">
                  <span className="mt-0.5 text-sky-200">
                    <span className="text-base">i</span>
                  </span>
                  <p className="text-xs leading-relaxed text-sky-100/75">
                    <strong className="text-sky-100">Mock Payment Note:</strong>{" "}
                    This is a simulated payment for testing purposes. Real
                    payment gateway integration coming soon.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Phase Tracker */}
          {projectProgress.phases.length > 0 &&
            phasePlan.phasePlanStatus === "approved" && (
              <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-heading text-2xl font-bold text-white">
                    Phase Progress
                  </h2>
                  {projectProgress.canUpdate ? (
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                      Editable by you
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
                      Read-only view
                    </span>
                  )}
                </div>

                {updateError && (
                  <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-4">
                    <p className="text-sm text-red-200">{updateError}</p>
                  </div>
                )}

                <div className="relative mt-6 space-y-4 pl-7 sm:pl-9">
                  <div className="absolute bottom-8 left-[0.7rem] top-8 w-px bg-white/10 sm:left-[1rem]" />
                  <div
                    className="absolute left-[0.7rem] top-8 w-px bg-primary transition-[height] duration-500 sm:left-[1rem]"
                    style={{
                      height: `${projectProgress.phases.length > 1 ? (completedPhaseCount / (projectProgress.phases.length - 1)) * 100 : completedPhaseCount > 0 ? 100 : 0}%`,
                    }}
                  />
                  {projectProgress.phases.map((phase) => {
                    const isUpdating = updatingPhaseId === phase.id;
                    const phasePlanPhase = phasePlan.phases.find(
                      (planPhase) => planPhase.id === phase.id,
                    );
                    const phasePrice =
                      phase.price ?? phasePlanPhase?.price ?? 0;
                    const paymentStatus =
                      phase.paymentStatus ?? phasePlanPhase?.paymentStatus;
                    const isAdvancePaid = phasePlan.advancePaid;
                    const isLocked =
                      !isAdvancePaid && phase.status === "not_started";

                    return (
                      <article
                        key={phase.id}
                        className={`relative rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.2)] ${isLocked ? "border-white/10 bg-void/60 opacity-65" : "border-white/10 bg-void/45 hover:border-primary/25"}`}
                      >
                        <span
                          className={`absolute -left-[2.05rem] top-6 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-surface sm:-left-[2.35rem] ${phase.status === "completed" ? "border-primary text-primary" : isLocked ? "border-white/20 text-white/40" : "border-white/30 text-white/70"}`}
                        >
                          <StatusIcon status={phase.status} />
                        </span>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex-1">
                            <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                              Phase {phase.order + 1}
                            </p>
                            <h3 className="mt-1 text-sm font-semibold text-white">
                              {phase.name}
                            </h3>
                            {phase.description && (
                              <p className="mt-1 text-xs text-white/60">
                                {phase.description}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-4 text-xs">
                              <span className="text-white/50">
                                Due {formatDate(phase.dueDate)}
                              </span>
                              {phasePrice > 0 && (
                                <span className="font-semibold text-primary">
                                  {formatCurrency(phasePrice)}
                                </span>
                              )}
                              {paymentStatus === "paid" && (
                                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-emerald-200">
                                  Paid
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                                statusBadgeClass[phase.status]
                              }`}
                            >
                              <StatusIcon status={phase.status} />
                              {phase.status.replace(/_/g, " ")}
                            </span>
                            {projectProgress.canUpdate && (
                              <select
                                value={phase.status}
                                onChange={(e) =>
                                  handleUpdatePhase(
                                    phase.id,
                                    e.target.value as ProjectPhaseStatus,
                                  )
                                }
                                disabled={
                                  isUpdating ||
                                  (!isAdvancePaid &&
                                    phase.status === "not_started")
                                }
                                title={
                                  !isAdvancePaid &&
                                  phase.status === "not_started"
                                    ? "Advance payment required"
                                    : ""
                                }
                                className="rounded-lg border border-white/10 bg-void/60 px-2 py-1 text-xs text-white outline-none transition-colors hover:border-white/20 focus:border-primary/50 disabled:opacity-50"
                              >
                                {statusOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        {/* Phase Payment for phase_by_phase */}
                        {phasePlan.paymentPlan === "phase_by_phase" &&
                          (phase.status === "awaiting_approval" ||
                            phase.status === "completed") &&
                          paymentStatus === "unpaid" &&
                          currentUser?.role === "client" && (
                            <button
                              type="button"
                              onClick={() => void handlePayForPhase(phase.id)}
                              disabled={isProcessingPayment}
                              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/20 active:translate-y-0 disabled:opacity-50"
                            >
                              <span className="text-sm font-bold">$</span>
                              {isProcessingPayment
                                ? "Processing..."
                                : `Pay for this phase (${formatCurrency(phasePrice)}) - Mock`}
                            </button>
                          )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
        </>
      ) : null}
    </div>
  );
}
