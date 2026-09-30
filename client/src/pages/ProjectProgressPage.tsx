import { CheckCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageButton } from "../components/messages/MessageButton";
import { BackButton } from "../components/BackButton";
import {
  inputClassName,
  panelClassName,
  primaryButtonClassName,
  rowDangerButtonClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FormField } from "../components/dashboard/ui/FormField";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { ProgressBar } from "../components/dashboard/ui/ProgressBar";
import { ErrorPanel } from "../components/dashboard/ui/StatePanels";
import {
  ChangeRequestNote,
  type PhaseChangeRequest,
  PhaseActions,
} from "../components/project/PhaseActions";
import {
  PhaseHandover,
  type PhaseSubmission,
} from "../components/project/PhaseDeliverables";
import { CustomerReviewForm } from "../components/profile/shared/CustomerReviewForm";
import { type CustomerReview } from "../components/profile/shared/profileTypes";
import {
  ProjectHandover,
  type ProjectReview,
  ProviderReviewCard,
} from "../components/project/ProjectCloseout";
import { useAuth } from "../context/AuthContext";
import { countOf, formatCurrency } from "../lib/format";
import { postFormWithProgress } from "../lib/messageAttachments";
import { moneyValue } from "../lib/money";
import {
  formatRate,
  startCheckout,
  type CheckoutRequest,
} from "../lib/payments";
import { dashboardBase, isProviderRole } from "../lib/dashboardPaths";
import { ProjectRequirementsList } from "../components/project/ProjectRequirementsList";
import { SiteDetailsPanel } from "../components/project/SiteDetailsPanel";
import {
  type ProjectRequirements,
  findCategory,
  useProjectCriteria,
} from "../lib/projectCriteria";
import { type PrivateSite, type PublicSite, toSite } from "../lib/siteDetails";
import { ProjectProblemPanel } from "../components/project/dispute/ProjectProblemPanel";

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
  description: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate: string | null;
  completedAt: string | null;
  price: number;
  paymentStatus: "paid" | "unpaid";
  paidAt: string | null;
  /** What approving this phase costs on the phase-by-phase plan. */
  amountDue: number;
  /** What has actually been charged for this phase. */
  amountPaid: number;
  changeRequest: PhaseChangeRequest | null;
  /** What the engineer handed over each time they submitted, oldest first. */
  submissions: PhaseSubmission[];
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
  amountDue?: number;
}

interface PhasePlan {
  projectId: string;
  phasePlanStatus: PhasePlanStatus;
  totalAgreedValue?: number;
  paymentPlan?: PaymentPlan | null;
  advanceRequiredAmount?: number | null;
  advancePaid: boolean;
  advancePaidAt?: string;
  fullPaymentPaid: boolean;
  fullPaymentPaidAt?: string;
  /**
   * Work is paid into CivilHub's hold before it starts and released on
   * approval. False only for projects planned before funding existed.
   */
  fundsBeforeWork?: boolean;
  /** The advance this plan needs; known before the client approves it. */
  advanceAmount: number;
  remainingBalance: number;
  phasePlanFeedback: { note: string; rejectedAt: string } | null;
  phases: PhasePlanPhase[];
  /** CivilHub's share of each payment, taken from the engineer's side. */
  commissionRate?: number;
  /** Settled payments, oldest first. */
  payments?: ProjectPaymentRecord[];
}

interface ProjectPaymentRecord {
  tranId: string | null;
  type: "advance" | "phase" | "full_remaining";
  phaseId: string | null;
  amount: number;
  platformFee: number;
  payeeAmount: number;
  /** e.g. "bKash"; null for payments made before the gateway. */
  method: string | null;
  paidAt: string | null;
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
    completedAt: string | null;
    category?: string | null;
    requirements?: ProjectRequirements | null;
    /** The exact site: only the client and hired engineer reach this page. */
    site?: PublicSite | PrivateSite | null;
  };
  client: ProjectParty | null;
  provider: ProjectParty | null;
  phases: ProjectPhase[];
  canUpdate: boolean;
  /** The closing record, once every phase is approved and paid. */
  completion: ProjectCompletion | null;
}

interface ProjectParty {
  id: string;
  name: string;
  role: string;
}

interface ProjectCompletion {
  completedAt: string;
  startedAt: string | null;
  totalPaid: number;
  phaseCount: number;
  review: ProjectReview | null;
  /** What the engineer or company said about the client. */
  customerReview: CustomerReview | null;
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

const statusLabels: Record<ProjectPhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  delayed: "Delayed",
};

const statusBadgeClass: Record<ProjectPhaseStatus, string> = {
  not_started: "border-white/20 bg-white/10 text-white/70",
  in_progress: "border-sky-300/40 bg-sky-300/10 text-sky-200",
  awaiting_approval: "border-violet-300/40 bg-violet-300/10 text-violet-200",
  completed: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200",
  delayed: "border-rose-300/40 bg-rose-300/10 text-rose-200",
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

const formatLongDate = (value: string | null): string => {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

/** "3 weeks", "2 months": how long the work ran, from the advance to the end. */
const formatDuration = (start: string | null, end: string): string => {
  if (!start) return "Not recorded";
  const days = Math.max(
    1,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 864e5),
  );
  if (days < 14) return countOf(days, "day", "days");
  if (days < 60) return countOf(Math.round(days / 7), "week", "weeks");
  return countOf(Math.round(days / 30), "month", "months");
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

export function ProjectProgressPage(): ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentUser } = useAuth();
  const { spec } = useProjectCriteria();

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
  // What the engineer typed in each price box ("2.5 lakh"), kept so the box
  // doesn't jump to digits mid-typing; the parsed number lives in the phase.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
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
  const [actionsLocked, setActionsLocked] = useState<boolean>(false);

  const isCompleted = projectProgress?.project.status === "completed";
  // A finished project leaves the Projects list for Project history, so the
  // way back goes there.
  const backPath = useMemo(
    () =>
      `${dashboardBase(currentUser?.role)}/${isCompleted ? "history" : "projects"}`,
    [currentUser?.role, isCompleted],
  );

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

      const progressData = (await progressRes.json()) as ProjectProgressResponse;
      setProjectProgress({
        ...progressData,
        project: { ...progressData.project, site: toSite(progressData.project.site) },
      });

      if (planRes.ok) {
        const planData = (await planRes.json()) as PhasePlan;
        setPhasePlan(planData);
        // Reopening a saved or rejected draft continues from its phases
        // instead of an empty form.
        if (planData.phasePlanStatus === "draft" && planData.phases.length > 0) {
          setPhasePlanFormData(
            planData.phases.map((phase) => ({
              ...phase,
              estimatedDueDate: phase.estimatedDueDate.slice(0, 10),
            })),
          );
        }
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

  // Hands a phase over with a note and files. Returns an error message, or ""
  // once it's sent.
  const handleSubmitPhase = async (
    phaseId: string,
    note: string,
    files: File[],
    onProgress: (fraction: number) => void,
  ): Promise<string> => {
    if (!projectId) return "Project ID is missing.";
    const formData = new FormData();
    formData.append("note", note);
    for (const file of files) formData.append("files", file);
    setUpdateError("");
    try {
      const result = await postFormWithProgress(
        `${API_BASE_URL}/api/projects/${projectId}/phases/${phaseId}/submit`,
        formData,
        onProgress,
      );
      if (!result.ok) return getErrorMessage(result.body);
      await loadData();
      return "";
    } catch {
      return "Unable to connect to CivilHub. Please try again.";
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
        `Phase prices add up to ${formatCurrency(totalPrice)}, but the agreed project value is ${formatCurrency(totalAgreedValue)}.`,
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

    await payThroughGateway({ purpose: "advance", projectId });
  };

  // Opens SSLCommerz; the page only stays here if the checkout couldn't open.
  const payThroughGateway = async (request: CheckoutRequest): Promise<void> => {
    setIsProcessingPayment(true);
    setPaymentError("");
    const error = await startCheckout(request);
    if (error) {
      setPaymentError(error);
      setIsProcessingPayment(false);
    }
  };

  // Pays a phase into CivilHub's hold so work on it can start.
  const handleFundPhase = async (phaseId: string): Promise<void> => {
    if (!projectId) return;
    setUpdatingPhaseId(phaseId);
    setUpdateError("");
    const error = await startCheckout({ purpose: "phase", projectId, phaseId });
    if (error) {
      setUpdateError(error);
      setUpdatingPhaseId(null);
    }
  };

  // Approving completes the phase. When approval costs something (every phase
  // on the phase-by-phase plan, or the final full-upfront phase with the
  // balance unpaid), it's "Approve & pay": the phase completes once
  // SSLCommerz confirms the payment.
  const handleApprovePhase = async (phaseId: string): Promise<void> => {
    if (!projectId || !phasePlan || !projectProgress) return;

    setUpdatingPhaseId(phaseId);
    setUpdateError("");

    const phases = projectProgress.phases;
    const phase = phases.find((item) => item.id === phaseId);
    const isFinalPhase = phases[phases.length - 1]?.id === phaseId;
    // Funded work was paid for before it started.
    const needsPayment = phasePlan.fundsBeforeWork
      ? false
      : phasePlan.paymentPlan === "phase_by_phase"
        ? (phase?.amountDue ?? 0) > 0
        : isFinalPhase &&
          !phasePlan.fullPaymentPaid &&
          phasePlan.remainingBalance > 0;
    if (needsPayment) {
      const error = await startCheckout({ purpose: "phase", projectId, phaseId });
      if (error) {
        setUpdateError(error);
        setUpdatingPhaseId(null);
      }
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phases/${phaseId}/approve`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        setUpdateError(getErrorMessage(await response.json()));
        return;
      }
      await loadData();
    } catch {
      setUpdateError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setUpdatingPhaseId(null);
    }
  };

  const handleRequestChanges = async (
    phaseId: string,
    note: string,
  ): Promise<boolean> => {
    if (!projectId) return false;

    setUpdateError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phases/${phaseId}/request-changes`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
      if (!response.ok) {
        setUpdateError(getErrorMessage(await response.json()));
        return false;
      }
      await loadData();
      return true;
    } catch {
      setUpdateError("Unable to connect to CivilHub. Please try again.");
      return false;
    }
  };

  const handlePayFullRemaining = async (): Promise<void> => {
    if (!projectId) {
      return;
    }

    await payThroughGateway({ purpose: "full_remaining", projectId });
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

  const isEngineerViewer = isProviderRole(currentUser?.role);
  const isClientViewer = currentUser?.role === "client";
  // actionsLocked is set by the problem panel: paused for a dispute, or cancelled.
  const totalPhases = projectProgress?.phases.length ?? 0;
  const phasePaymentsPaid =
    projectProgress?.phases.reduce((sum, phase) => sum + phase.amountPaid, 0) ??
    0;
  const settledPayments = phasePlan?.payments ?? [];
  const commissionRate = phasePlan?.commissionRate ?? 0.1;
  const paymentFor = (
    type: ProjectPaymentRecord["type"],
    phaseId: string | null = null,
  ): ProjectPaymentRecord | undefined =>
    settledPayments.find(
      (payment) =>
        payment.type === type && (phaseId === null || payment.phaseId === phaseId),
    );
  // "via bKash", and for the engineer what they keep after CivilHub's fee.
  const paidDetail = (payment: ProjectPaymentRecord | undefined): string => {
    if (!payment?.method) return "";
    const net =
      isEngineerViewer && payment.platformFee > 0
        ? ` · you receive ${formatCurrency(payment.payeeAmount)}`
        : "";
    return ` via ${payment.method}${net}`;
  };
  const remainingPayment = paymentFor("full_remaining");

  // One sentence saying where the project stands and whose move it is.
  const getHeaderSummary = (): string => {
    if (!phasePlan || !projectProgress) return "";
    const completion = projectProgress.completion;
    if (completion) {
      const phases =
        completion.phaseCount === 1
          ? "Its phase was approved and paid."
          : completion.phaseCount === 2
            ? "Both phases were approved and paid."
            : `All ${completion.phaseCount} phases were approved and paid.`;
      const who = isClientViewer
        ? projectProgress.provider
          ? ` Delivered by ${projectProgress.provider.name}.`
          : ""
        : projectProgress.client
          ? ` Delivered for ${projectProgress.client.name}.`
          : "";
      return `Completed on ${formatLongDate(completion.completedAt)}. ${phases}${who}`;
    }
    switch (phasePlan.phasePlanStatus) {
      case "not_created":
      case "draft":
        return isEngineerViewer
          ? "Split the work into phases so the client can approve the plan."
          : "Your engineer is drafting the phase plan. You'll review it before any work starts.";
      case "pending_client_approval":
        return isEngineerViewer
          ? "Your phase plan is with the client for review."
          : "The phase plan is ready for your review.";
      case "approved":
        if (!phasePlan.advancePaid) {
          return isEngineerViewer
            ? "The plan is approved. Work can start once the client pays the advance."
            : "Pay the advance so work can start.";
        }
        return `${completedPhaseCount} of ${totalPhases} phases approved.`;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <BackButton
        to={backPath}
        label={isCompleted ? "Back to project history" : "Back to projects"}
      />

      {isLoading ? (
        <section className={`${panelClassName} animate-pulse p-8`} aria-label="Loading project">
          <div className="h-9 w-2/3 rounded bg-white/10" />
          <div className="mt-4 h-4 w-1/3 rounded bg-white/10" />
        </section>
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void loadData()} />
      ) : projectProgress && phasePlan ? (
        <>
          <header>
            {projectProgress.completion ? (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                <CheckCircleIcon className="h-4 w-4" weight="fill" aria-hidden="true" />
                Completed
              </p>
            ) : null}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
                  {projectProgress.project.name}
                </h1>
                <p className="mt-3 max-w-2xl text-white/60">{getHeaderSummary()}</p>
              </div>
              {(() => {
                const otherParty = isClientViewer
                  ? projectProgress.provider
                  : projectProgress.client;
                return otherParty ? (
                  <MessageButton
                    userId={otherParty.id}
                    projectId={projectProgress.project.id}
                    label={`Message ${otherParty.name.split(" ")[0]}`}
                    size="page"
                  />
                ) : null;
              })()}
            </div>
          </header>

          {currentUser && (isClientViewer || projectProgress.canUpdate) && projectId ? (
            <ProjectProblemPanel
              projectId={projectId}
              viewerId={currentUser.id}
              viewerRole={isClientViewer ? "client" : "provider"}
              otherName={
                (isClientViewer ? projectProgress.provider?.name : projectProgress.client?.name) ??
                "The other side"
              }
              onLockChange={setActionsLocked}
              onSettled={() => void loadData()}
            />
          ) : null}

          {projectProgress.completion ? (
            <section
              aria-label="Project summary"
              className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"
            >
              <div className="bg-surface p-5 sm:p-6">
                <p className="text-sm text-white/55">Completed on</p>
                <p className="mt-2 font-heading text-2xl font-bold text-white">
                  {formatLongDate(projectProgress.completion.completedAt)}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {countOf(projectProgress.completion.phaseCount, "phase", "phases")} approved
                </p>
              </div>
              <div className="bg-surface p-5 sm:p-6">
                <p className="text-sm text-white/55">
                  {isClientViewer ? "Total paid" : "Client paid"}
                </p>
                <p className="mt-2 font-heading text-2xl font-bold tabular-nums text-white">
                  {formatCurrency(projectProgress.completion.totalPaid)}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  Agreed {formatCurrency(totalAgreedValue)}
                </p>
              </div>
              <div className="bg-surface p-5 sm:p-6">
                <p className="text-sm text-white/55">Duration</p>
                <p className="mt-2 font-heading text-2xl font-bold text-white">
                  {formatDuration(
                    projectProgress.completion.startedAt,
                    projectProgress.completion.completedAt,
                  )}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {projectProgress.completion.startedAt
                    ? `From ${formatLongDate(projectProgress.completion.startedAt)}`
                    : "Start date not recorded"}
                </p>
              </div>
            </section>
          ) : (
          <section
            aria-label="Project summary"
            className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"
          >
            <div className="bg-surface p-5 sm:p-6">
              <p className="text-sm text-white/55">Progress</p>
              <div className="mt-3">
                <ProgressBar
                  value={projectProgress.project.progressPercentage}
                  label="Project progress"
                />
              </div>
              <p className="mt-2 text-xs text-white/45">
                {totalPhases > 0
                  ? `${completedPhaseCount} of ${totalPhases} phases approved`
                  : "No phases yet"}
              </p>
            </div>
            <div className="bg-surface p-5 sm:p-6">
              <p className="text-sm text-white/55">Current phase</p>
              <p className="mt-2 font-semibold text-white">
                {projectProgress.project.currentPhaseName}
              </p>
            </div>
            <div className="bg-surface p-5 sm:p-6">
              <p className="text-sm text-white/55">Next milestone</p>
              <p className="mt-2 font-semibold text-white">
                {projectProgress.project.nextMilestone}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {projectProgress.project.nextMilestoneDueDate
                  ? `Due ${formatDate(projectProgress.project.nextMilestoneDueDate)}`
                  : "No date yet"}
              </p>
            </div>
          </section>
          )}

          <ProjectSiteSection
            project={projectProgress.project}
            spec={spec}
          />

          {isClientViewer && reviewEligibility?.canReview && (
            <section className={`${panelClassName} border-t-2 border-t-primary p-6 sm:p-8`}>
              <h2 className="font-heading text-2xl font-bold text-white">
                How did the project go?
              </h2>
              <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/60">
                Your review appears on{" "}
                {projectProgress.provider
                  ? `${projectProgress.provider.name}'s`
                  : "the engineer's"}{" "}
                profile and helps other clients choose.
              </p>
              <fieldset className="mt-5">
                <legend className="text-sm font-semibold text-white/80">Rating</legend>
                <div className="mt-2 flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      aria-pressed={value === reviewRating}
                      onClick={() => setReviewRating(value)}
                      className={`rounded text-3xl leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${value <= reviewRating ? "text-amber-300" : "text-white/20 hover:text-amber-200/70"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 grid gap-2">
                <label htmlFor="review-text" className="text-sm font-semibold text-white/80">
                  Your review
                </label>
                <textarea
                  id="review-text"
                  value={reviewText}
                  onChange={(event) => setReviewText(event.target.value.slice(0, 1000))}
                  rows={4}
                  maxLength={1000}
                  aria-describedby="review-text-hint"
                  className={`${inputClassName} resize-none`}
                />
                <p id="review-text-hint" className="flex justify-between gap-4 text-xs text-white/45">
                  <span>What went well, and what could have gone better.</span>
                  <span className="tabular-nums">{reviewText.length}/1000</span>
                </p>
              </div>
              {reviewError && (
                <p className="mt-3 text-sm text-rose-300" role="alert">
                  {reviewError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleSubmitReview()}
                disabled={isSubmittingReview}
                className={`${primaryButtonClassName} mt-5`}
              >
                {isSubmittingReview ? "Submitting..." : "Submit review"}
              </button>
            </section>
          )}

          {isClientViewer &&
            reviewEligibility?.alreadyReviewed &&
            reviewEligibility.review && (
              <section className={`${panelClassName} p-6 sm:p-8`}>
                <h2 className="font-heading text-2xl font-bold text-white">
                  {reviewSuccess ? "Thanks for your review" : "Your review"}
                </h2>
                <p
                  className="mt-3 flex gap-0.5 text-lg text-amber-300"
                  aria-label={`${reviewEligibility.review.rating} out of 5 stars`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <span
                      key={index}
                      aria-hidden="true"
                      className={index < reviewEligibility.review!.rating ? "" : "text-white/15"}
                    >
                      ★
                    </span>
                  ))}
                </p>
                <p className="mt-3 max-w-[65ch] text-sm leading-6 text-white/75">
                  {reviewEligibility.review.reviewText}
                </p>
                <p className="mt-3 text-xs text-white/40">
                  Submitted {formatDate(reviewEligibility.review.createdAt)}
                </p>
              </section>
            )}

          {isEngineerViewer && projectProgress.completion ? (
            <ProviderReviewCard
              review={projectProgress.completion.review}
              clientName={projectProgress.client?.name ?? "The client"}
              onReplied={(review) =>
                setProjectProgress((current) =>
                  current?.completion
                    ? { ...current, completion: { ...current.completion, review } }
                    : current,
                )
              }
            />
          ) : null}

          {isEngineerViewer && projectProgress.completion && projectId ? (
            <CustomerReviewForm
              target={{ projectId }}
              subjectName={projectProgress.client?.name ?? "the client"}
              subjectKind="client"
              existing={projectProgress.completion.customerReview}
              onSaved={(customerReview) =>
                setProjectProgress((current) =>
                  current?.completion
                    ? { ...current, completion: { ...current.completion, customerReview } }
                    : current,
                )
              }
            />
          ) : null}

          {isClientViewer && projectProgress.completion?.customerReview ? (
            <section className={`${panelClassName} p-6 sm:p-8`}>
              <h2 className="font-heading text-2xl font-bold text-white">
                {projectProgress.completion.customerReview.author.name} reviewed you
              </h2>
              <p
                className="mt-3 flex gap-0.5 text-lg text-amber-300"
                aria-label={`${projectProgress.completion.customerReview.rating} out of 5 stars`}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className={index < projectProgress.completion!.customerReview!.rating ? "" : "text-white/15"}
                  >
                    ★
                  </span>
                ))}
              </p>
              <p className="mt-3 max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/75">
                {projectProgress.completion.customerReview.reviewText}
              </p>
              <p className="mt-3 text-xs text-white/40">Shown on your profile</p>
            </section>
          ) : null}

          {projectProgress.completion ? (
            <ProjectHandover phases={projectProgress.phases} />
          ) : null}

          {isEngineerViewer && !actionsLocked &&
            (phasePlan.phasePlanStatus === "not_created" ||
              phasePlan.phasePlanStatus === "draft") && (
              <section className={`${panelClassName} p-6 sm:p-8`}>
                <h2 className="font-heading text-2xl font-bold text-white">
                  Build the phase plan
                </h2>
                <p className="mt-2 max-w-[65ch] text-sm leading-6 text-white/60">
                  Split the work into phases whose prices add up to{" "}
                  {formatCurrency(totalAgreedValue)}. The client pays a{" "}
                  {formatCurrency(phasePlan.advanceAmount)} advance before work
                  starts, then pays for each phase when they approve it.
                </p>

                {phasePlan.phasePlanFeedback ? (
                  <div className="mt-5 rounded-xl border border-violet-300/25 bg-violet-300/5 p-4">
                    <p className="text-sm font-semibold text-violet-100">
                      The client asked for changes on{" "}
                      {formatDate(phasePlan.phasePlanFeedback.rejectedAt)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-white/75">
                      {phasePlan.phasePlanFeedback.note}
                    </p>
                  </div>
                ) : null}

                {phasePlanErrors.length > 0 && (
                  <ul
                    role="alert"
                    className="mt-5 grid gap-1 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"
                  >
                    {phasePlanErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}

                <ol className="mt-6 grid gap-4">
                  {phasePlanFormData.map((phase, index) => (
                    <li key={phase.id} className="rounded-xl border border-white/10 bg-void/45 p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-white">Phase {index + 1}</h3>
                        {phasePlanFormData.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhase(index)}
                            className={rowDangerButtonClassName}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <FormField id={`phase-${phase.id}-title`} label="Title">
                          <input
                            id={`phase-${phase.id}-title`}
                            value={phase.title}
                            onChange={(e) => handlePhaseChange(index, "title", e.target.value)}
                            className={inputClassName}
                          />
                        </FormField>
                        <FormField id={`phase-${phase.id}-price`} label="Price">
                          <MoneyInput
                            id={`phase-${phase.id}-price`}
                            value={priceDrafts[phase.id] ?? (phase.price ? String(phase.price) : "")}
                            onChange={(value) => {
                              setPriceDrafts((current) => ({ ...current, [phase.id]: value }));
                              handlePhaseChange(index, "price", moneyValue(value) ?? 0);
                            }}
                          />
                        </FormField>
                        <FormField id={`phase-${phase.id}-due`} label="Due by">
                          <input
                            id={`phase-${phase.id}-due`}
                            type="date"
                            value={phase.estimatedDueDate}
                            onChange={(e) => handlePhaseChange(index, "estimatedDueDate", e.target.value)}
                            className={inputClassName}
                          />
                        </FormField>
                      </div>
                      <FormField
                        id={`phase-${phase.id}-description`}
                        label="What's included"
                        className="mt-4"
                      >
                        <textarea
                          id={`phase-${phase.id}-description`}
                          value={phase.description}
                          onChange={(e) => handlePhaseChange(index, "description", e.target.value)}
                          rows={2}
                          className={`${inputClassName} resize-y`}
                        />
                      </FormField>
                    </li>
                  ))}
                </ol>

                <div className="mt-6 flex flex-col gap-1 rounded-xl border border-white/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-white/60">
                    Phases add up to{" "}
                    <span className="font-semibold tabular-nums text-white">
                      {formatCurrency(totalPhasePrice)}
                    </span>{" "}
                    of {formatCurrency(totalAgreedValue)}
                  </p>
                  <p className={`text-sm font-semibold ${pricesMatch ? "text-emerald-200" : "text-violet-200"}`}>
                    {pricesMatch
                      ? "Matches the agreed price"
                      : totalPhasePrice > totalAgreedValue
                        ? `${formatCurrency(totalPhasePrice - totalAgreedValue)} over`
                        : `${formatCurrency(totalAgreedValue - totalPhasePrice)} still to assign`}
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={handleAddPhase}
                    disabled={isSubmittingPhasePlan}
                    className={secondaryButtonClassName}
                  >
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    Add phase
                  </button>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void handleSaveDraft()}
                      disabled={isSubmittingPhasePlan}
                      className={secondaryButtonClassName}
                    >
                      {isSubmittingPhasePlan ? "Saving..." : "Save draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmitForApproval()}
                      disabled={isSubmittingPhasePlan || !pricesMatch}
                      className={primaryButtonClassName}
                    >
                      {isSubmittingPhasePlan ? "Sending..." : "Send to client"}
                    </button>
                  </div>
                </div>
              </section>
            )}

          {isClientViewer && !actionsLocked &&
            phasePlan.phasePlanStatus === "pending_client_approval" && (
              <section className={`${panelClassName} border-t-2 border-t-primary p-6 sm:p-8`}>
                <h2 className="font-heading text-2xl font-bold text-white">
                  Review the phase plan
                </h2>
                <p className="mt-2 max-w-[65ch] text-sm leading-6 text-white/60">
                  {countOf(phasePlan.phases.length, "phase", "phases")} adding up
                  to {formatCurrency(totalAgreedValue)}. Choose how you want to
                  pay, then approve the plan or send it back with changes.
                </p>

                {phasePlanErrors.length > 0 && (
                  <ul
                    role="alert"
                    className="mt-5 grid gap-1 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"
                  >
                    {phasePlanErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}

                <ol className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10">
                  {phasePlan.phases.map((phase, index) => (
                    <li key={phase.id} className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
                      <div className="min-w-0">
                        <p className="text-xs text-white/45">Phase {index + 1}</p>
                        <h3 className="mt-0.5 font-semibold text-white">{phase.title}</h3>
                        {phase.description ? (
                          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-white/60">{phase.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-white/45">
                          Due {formatDate(phase.estimatedDueDate)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-white">
                          {formatCurrency(phase.price)}
                        </p>
                        {selectedPaymentPlan === "phase_by_phase" &&
                        typeof phase.amountDue === "number" ? (
                          <p className="mt-1 text-xs text-white/50">
                            {formatCurrency(phase.amountDue)}{" "}
                            {phasePlan.fundsBeforeWork ? "before it starts" : "when you approve it"}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>

                <fieldset className="mt-6">
                  <legend className="text-sm font-semibold text-white/80">
                    How do you want to pay?
                  </legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        {
                          key: "phase_by_phase",
                          title: "Phase by phase",
                          body: phasePlan.fundsBeforeWork
                            ? `${formatCurrency(phasePlan.advanceAmount)} advance now, then the rest of each phase's price before it starts. CivilHub holds it until you approve the phase.`
                            : `${formatCurrency(phasePlan.advanceAmount)} advance now, then the rest of each phase's price when you approve it.`,
                        },
                        {
                          key: "full_upfront",
                          title: "Full upfront",
                          body: phasePlan.fundsBeforeWork
                            ? `${formatCurrency(phasePlan.advanceAmount)} advance now, then ${formatCurrency(phasePlan.remainingBalance)} before work starts. CivilHub releases it as you approve each phase.`
                            : `${formatCurrency(phasePlan.advanceAmount)} advance now, then ${formatCurrency(phasePlan.remainingBalance)} any time before you approve the final phase.`,
                        },
                      ] as const
                    ).map((option) => (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-void p-4 transition-colors hover:border-white/35 has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow"
                      >
                        <input
                          type="radio"
                          name="payment-plan"
                          value={option.key}
                          checked={selectedPaymentPlan === option.key}
                          onChange={() => setSelectedPaymentPlan(option.key)}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span>
                          <span className="block font-semibold text-white">{option.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-white/60">
                            {option.body}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <button
                  type="button"
                  onClick={() => void handleApprovePlan()}
                  disabled={isSubmittingPhasePlan}
                  className={`${primaryButtonClassName} mt-6`}
                >
                  {isSubmittingPhasePlan ? "Approving..." : "Approve plan"}
                </button>

                <div className="mt-8 grid gap-2 border-t border-white/10 pt-6">
                  <label htmlFor="plan-feedback" className="text-sm font-semibold text-white/80">
                    Or ask for changes
                  </label>
                  <textarea
                    id="plan-feedback"
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    aria-describedby="plan-feedback-hint"
                    className={`${inputClassName} resize-y`}
                  />
                  <p id="plan-feedback-hint" className="text-xs text-white/45">
                    The engineer sees this note while revising the plan.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleRejectPlan()}
                    disabled={isRejectingPlan || isSubmittingPhasePlan || !rejectFeedback.trim()}
                    className={`${secondaryButtonClassName} mt-2`}
                  >
                    {isRejectingPlan ? "Sending..." : "Send back with changes"}
                  </button>
                </div>
              </section>
            )}

          {phasePlan.phasePlanStatus === "approved" && (
            <section className={`${panelClassName} p-6 sm:p-8`} aria-labelledby="payments-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="payments-heading" className="font-heading text-2xl font-bold text-white">
                  Payments
                </h2>
                <p className="text-sm text-white/50">
                  {phasePlan.paymentPlan === "full_upfront" ? "Full upfront" : "Phase by phase"}
                </p>
              </div>

              {paymentError && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"
                >
                  {paymentError}
                </p>
              )}

              <dl className="mt-5 divide-y divide-white/10 rounded-xl border border-white/10">
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:px-5">
                  <div>
                    <dt className="font-semibold text-white">Advance</dt>
                    <dd className={`mt-0.5 text-sm ${phasePlan.advancePaid ? "text-emerald-200" : "text-white/55"}`}>
                      {phasePlan.advancePaid
                        ? `Paid${phasePlan.advancePaidAt ? ` on ${formatDate(phasePlan.advancePaidAt)}` : ""}${paidDetail(paymentFor("advance"))}`
                        : "Due before work starts"}
                    </dd>
                  </div>
                  <dd className="text-lg font-semibold tabular-nums text-white sm:text-right">
                    {formatCurrency(phasePlan.advanceRequiredAmount || phasePlan.advanceAmount)}
                  </dd>
                  {!phasePlan.advancePaid && isClientViewer && !actionsLocked ? (
                    <dd>
                      <button
                        type="button"
                        onClick={() => void handlePayAdvance()}
                        disabled={isProcessingPayment}
                        className={primaryButtonClassName}
                      >
                        {isProcessingPayment ? "Opening payment..." : "Pay advance"}
                      </button>
                    </dd>
                  ) : (
                    <dd className="hidden sm:block" />
                  )}
                </div>

                {phasePlan.paymentPlan === "full_upfront" ? (
                  <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:px-5">
                    <div>
                      <dt className="font-semibold text-white">Remaining balance</dt>
                      <dd className={`mt-0.5 text-sm ${phasePlan.fullPaymentPaid ? "text-emerald-200" : "text-white/55"}`}>
                        {phasePlan.fullPaymentPaid
                          ? `Paid${phasePlan.fullPaymentPaidAt ? ` on ${formatDate(phasePlan.fullPaymentPaidAt)}` : ""}${paidDetail(remainingPayment)}`
                          : phasePlan.fundsBeforeWork
                            ? "Due before work starts; CivilHub releases it as phases are approved"
                            : phasePlan.advancePaid
                              ? "Pay now, or when you approve the final phase"
                              : "Due after the advance"}
                      </dd>
                    </div>
                    <dd className="text-lg font-semibold tabular-nums text-white sm:text-right">
                      {formatCurrency(phasePlan.remainingBalance)}
                    </dd>
                    {phasePlan.advancePaid && !phasePlan.fullPaymentPaid && isClientViewer && !actionsLocked ? (
                      <dd>
                        <button
                          type="button"
                          onClick={() => void handlePayFullRemaining()}
                          disabled={isProcessingPayment}
                          className={secondaryButtonClassName}
                        >
                          {isProcessingPayment ? "Opening payment..." : "Pay remaining"}
                        </button>
                      </dd>
                    ) : (
                      <dd className="hidden sm:block" />
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 sm:px-5">
                    <div>
                      <dt className="font-semibold text-white">Phase payments</dt>
                      <dd className="mt-0.5 text-sm text-white/55">
                        {phasePlan.fundsBeforeWork
                          ? `Funded before each phase starts; CivilHub holds it until ${isClientViewer ? "you approve" : "the client approves"} the phase`
                          : `Paid as ${isClientViewer ? "you approve" : "the client approves"} each phase`}
                      </dd>
                    </div>
                    <dd className="text-lg font-semibold tabular-nums text-white sm:text-right">
                      {formatCurrency(phasePaymentsPaid)}
                      <span className="text-sm font-normal text-white/45">
                        {" "}
                        of {formatCurrency(phasePlan.remainingBalance)}
                      </span>
                    </dd>
                    <dd className="hidden sm:block" />
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                  <dt className="text-sm text-white/55">Agreed total</dt>
                  <dd className="font-semibold tabular-nums text-white/85">
                    {formatCurrency(totalAgreedValue)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-xs text-white/45">
                {isClientViewer
                  ? "Payments open SSLCommerz, where you can pay with bKash, Nagad, a card or internet banking."
                  : `CivilHub keeps a ${formatRate(commissionRate)} fee from each payment; the rest is yours.`}
              </p>
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
                  <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
                    {projectProgress.completion
                      ? "All phases approved"
                      : projectProgress.canUpdate
                      ? "You submit each phase"
                      : currentUser?.role === "client"
                        ? "You approve each phase"
                        : "View only"}
                  </span>
                </div>

                {updateError && (
                  <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-4">
                    <p className="text-sm text-rose-200">{updateError}</p>
                  </div>
                )}

                <div className="relative mt-6 space-y-4 pl-7 sm:pl-9">
                  <div className="absolute bottom-8 left-[0.7rem] top-8 w-px bg-white/10 sm:left-[1rem]" />
                  <div
                    className="absolute left-[0.7rem] top-8 w-px bg-primary transition-[height] duration-500 sm:left-[1rem]"
                    style={{
                      // The grey track runs between the first and last dots
                      // (4rem shorter than the list), so the fill must too.
                      height: `calc((100% - 4rem) * ${
                        projectProgress.phases.length > 1
                          ? Math.min(1, completedPhaseCount / (projectProgress.phases.length - 1))
                          : completedPhaseCount > 0
                            ? 1
                            : 0
                      })`,
                    }}
                  />
                  {projectProgress.phases.map((phase, index) => {
                    const isUpdating = updatingPhaseId === phase.id;
                    const isPhaseByPhase =
                      phasePlan.paymentPlan === "phase_by_phase";
                    const isLocked =
                      !phasePlan.advancePaid && phase.status === "not_started";
                    // Nobody acts on phases while the project is paused or cancelled.
                    const viewer = actionsLocked
                      ? "other"
                      : projectProgress.canUpdate
                      ? "engineer"
                      : currentUser?.role === "client"
                        ? "client"
                        : "other";

                    return (
                      <article
                        key={phase.id}
                        className={`relative rounded-xl border p-4 transition-colors duration-200 ${isLocked ? "border-white/10 bg-void/60 opacity-65" : phase.status === "awaiting_approval" ? "border-violet-300/30 bg-void/45" : "border-white/10 bg-void/45"}`}
                      >
                        <span
                          className={`absolute -left-[2.05rem] top-6 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-surface sm:-left-[2.35rem] ${phase.status === "completed" ? "border-primary text-primary" : isLocked ? "border-white/20 text-white/40" : "border-white/30 text-white/70"}`}
                        >
                          <StatusIcon status={phase.status} />
                        </span>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-white/45">
                              Phase {phase.order + 1}
                            </p>
                            <h3 className="mt-1 text-sm font-semibold text-white">
                              {phase.name}
                            </h3>
                            {phase.description && (
                              <p className="mt-1.5 max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/65">
                                <span className="sr-only">Scope: </span>
                                {phase.description}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              <span className="text-white/50">
                                Due {formatDate(phase.dueDate)}
                              </span>
                              <span className="font-semibold text-white/80">
                                {formatCurrency(phase.price)}
                              </span>
                              {isPhaseByPhase &&
                              phase.paymentStatus === "paid" ? (
                                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-emerald-200">
                                  {phasePlan.fundsBeforeWork && phase.status !== "completed"
                                    ? `Funded ${formatCurrency(phase.amountPaid)}, held by CivilHub`
                                    : `Paid ${formatCurrency(phase.amountPaid)}`}
                                  {paidDetail(paymentFor("phase", phase.id))}
                                </span>
                              ) : isPhaseByPhase ? (
                                <span
                                  className="text-white/50"
                                  title={`The advance already covers ${formatCurrency(Math.max(0, phase.price - phase.amountDue))} of this phase.`}
                                >
                                  {formatCurrency(phase.amountDue)}{" "}
                                  {phasePlan.fundsBeforeWork ? "to fund before it starts" : "due when approved"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <span
                            className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                              statusBadgeClass[phase.status]
                            }`}
                          >
                            <StatusIcon status={phase.status} />
                            {statusLabels[phase.status]}
                          </span>
                        </div>

                        {phase.changeRequest &&
                        phase.status !== "completed" ? (
                          <ChangeRequestNote
                            changeRequest={phase.changeRequest}
                          />
                        ) : null}

                        <PhaseHandover
                          submissions={phase.submissions}
                          phaseStatus={phase.status}
                          viewer={viewer}
                        />

                        <div className="mt-4 empty:hidden">
                          <PhaseActions
                            phase={phase}
                            previousPhase={
                              index > 0
                                ? projectProgress.phases[index - 1]
                                : null
                            }
                            isFinalPhase={
                              index === projectProgress.phases.length - 1
                            }
                            viewer={viewer}
                            paymentPlan={phasePlan.paymentPlan}
                            advancePaid={phasePlan.advancePaid}
                            fullPaymentPaid={phasePlan.fullPaymentPaid}
                            remainingBalance={phasePlan.remainingBalance}
                            fundsBeforeWork={Boolean(phasePlan.fundsBeforeWork)}
                            isBusy={isUpdating}
                            onSetStatus={(status) =>
                              void handleUpdatePhase(phase.id, status)
                            }
                            onFund={() => void handleFundPhase(phase.id)}
                            onSubmitPhase={(note, files, onProgress) =>
                              handleSubmitPhase(phase.id, note, files, onProgress)
                            }
                            onApprove={() => void handleApprovePhase(phase.id)}
                            onRequestChanges={(note) =>
                              handleRequestChanges(phase.id, note)
                            }
                          />
                        </div>
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

/** Where the site is and what the brief asked for, for the people on the job. */
function ProjectSiteSection({
  project,
  spec,
}: {
  project: ProjectProgressResponse["project"];
  spec: ReturnType<typeof useProjectCriteria>["spec"];
}): ReactElement | null {
  const criteria = findCategory(spec, project.category ?? "");
  const requirements = project.requirements ?? null;
  const hasRequirements =
    criteria !== null && requirements !== null && Object.keys(requirements).length > 0;
  if (!project.site && !hasRequirements) return null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {project.site ? (
        <SiteDetailsPanel
          site={project.site}
          siteOptions={spec?.siteOptions}
          headingId="project-site"
        />
      ) : null}
      {hasRequirements ? (
        <section
          aria-labelledby="project-requirements"
          className={`${panelClassName} grid gap-5 p-5 sm:p-6`}
        >
          <h2 id="project-requirements" className="font-heading text-2xl font-bold text-white">
            {criteria.title} details
          </h2>
          <ProjectRequirementsList criteria={criteria} requirements={requirements} />
        </section>
      ) : null}
    </div>
  );
}
