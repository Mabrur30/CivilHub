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
      const [progressRes, planRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/projects/${projectId}/progress`, {
          credentials: "include",
        }),
        fetch(`${API_BASE_URL}/api/projects/${projectId}/phase-plan`, {
          credentials: "include",
        }),
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
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
      setProjectProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [projectId]);

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

  const totalPhasePrice = phasePlanFormData.reduce(
    (sum, p) => sum + p.price,
    0,
  );
  const totalAgreedValue = phasePlan?.totalAgreedValue || 0;
  const pricesMatch = Math.abs(totalPhasePrice - totalAgreedValue) < 0.01;

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
          <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Project progress
            </p>
            <h1 className="mt-3 font-heading text-4xl font-bold text-white">
              {projectProgress.project.name}
            </h1>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-void/45 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Current phase
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {projectProgress.project.currentPhaseName}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-void/45 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Progress
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {projectProgress.project.progressPercentage}%
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-void/45 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Next milestone
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {projectProgress.project.nextMilestone}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  Due {formatDate(projectProgress.project.nextMilestoneDueDate)}
                </p>
              </div>
            </div>
          </section>

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
            <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-white">
                Payments
              </h2>

              {paymentError && (
                <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/5 p-4">
                  <p className="text-sm text-red-200">{paymentError}</p>
                </div>
              )}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {/* Advance Payment */}
                <div className="rounded-lg border border-white/10 bg-void/45 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                    Advance Payment
                  </p>
                  <p className="mt-2 text-xl font-bold text-white">
                    {formatCurrency(phasePlan.advanceRequiredAmount || 0)}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {phasePlan.advancePaid
                      ? "✓ Paid"
                      : "Required before work begins"}
                  </p>
                  {!phasePlan.advancePaid && currentUser?.role === "client" && (
                    <button
                      type="button"
                      onClick={() => void handlePayAdvance()}
                      disabled={isProcessingPayment}
                      className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isProcessingPayment
                        ? "Processing..."
                        : "Pay Advance (Mock)"}
                    </button>
                  )}
                </div>

                {/* Remaining Payment */}
                {phasePlan.paymentPlan === "full_upfront" && (
                  <div className="rounded-lg border border-white/10 bg-void/45 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/60">
                      Remaining Balance
                    </p>
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
                          className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
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
                <div className="mt-4 rounded-lg border border-blue-400/20 bg-blue-400/5 p-4">
                  <p className="text-xs text-blue-200">
                    💳 <strong>Mock Payment Note:</strong> This is a simulated
                    payment for testing purposes. Real payment gateway
                    integration coming soon.
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

                <div className="mt-5 space-y-3">
                  {projectProgress.phases.map((phase) => {
                    const isUpdating = updatingPhaseId === phase.id;
                    const phasePrice = phase.price || 0;
                    const isAdvancePaid = phasePlan.advancePaid;

                    return (
                      <article
                        key={phase.id}
                        className="rounded-xl border border-white/10 bg-void/45 p-4"
                      >
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
                              {phase.paymentStatus === "paid" && (
                                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2 py-0.5 text-emerald-200">
                                  Paid
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${
                                statusBadgeClass[phase.status]
                              }`}
                            >
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
                          phase.paymentStatus === "unpaid" &&
                          currentUser?.role === "client" && (
                            <button
                              type="button"
                              onClick={() => void handlePayForPhase(phase.id)}
                              disabled={isProcessingPayment}
                              className="mt-3 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/30 disabled:opacity-50"
                            >
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
