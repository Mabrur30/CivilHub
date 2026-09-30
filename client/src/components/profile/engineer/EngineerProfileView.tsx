import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { DeliveredProjects } from "../shared/DeliveredProjects";
import { type ChecklistItem, ProfileChecklist } from "../shared/ProfileChecklist";
import { ProfileEquipment } from "../shared/ProfileEquipment";
import { AboutSection } from "./AboutSection";
import { CertificatesSection } from "./CertificatesSection";
import { EducationSection } from "./EducationSection";
import { EngineerSidebar } from "./EngineerSidebar";
import {
  type CertificateEntry,
  type EngineerPublicProfile,
  type EngineerTask,
  type OpenRequest,
  type OwnEngineerData,
  type PortfolioEntry,
  hasStartingRate,
  isOwnEngineerData,
  requestJson,
} from "./engineerProfile";
import { ExperienceSection } from "./ExperienceSection";
import { PortfolioSection } from "./PortfolioSection";
import { RateLocationSection } from "./RateLocationSection";

type ProfileUpdate = (current: EngineerPublicProfile) => EngineerPublicProfile;

const buildChecklist = (
  profile: EngineerPublicProfile,
  portfolioCount: number,
  certificateCount: number,
): ChecklistItem<EngineerTask>[] => [
  { task: "photo", todo: "Add a photo", done: "Photo", isDone: Boolean(profile.profilePhotoUrl) },
  {
    task: "speciality",
    todo: "Choose your speciality",
    done: "Speciality",
    isDone: (profile.disciplines ?? []).length > 0,
  },
  { task: "about", todo: "Write an introduction", done: "Introduction", isDone: Boolean(profile.bio.trim()) },
  { task: "location", todo: "Say where you're based", done: "Location", isDone: Boolean(profile.location) },
  { task: "rate", todo: "Add a starting rate", done: "Starting rate", isDone: hasStartingRate(profile) },
  { task: "experience", todo: "Add experience", done: "Experience", isDone: profile.experience.length > 0 },
  { task: "portfolio", todo: "Add a project photo", done: "Portfolio", isDone: portfolioCount > 0 },
  { task: "certificate", todo: "Add a certificate", done: "Certificate", isDone: certificateCount > 0 },
];

/**
 * An engineer's public profile. The owner edits each section in place; the
 * page supplies visitor actions, reviews and posts.
 */
export function EngineerProfileView({
  profile,
  isSelf,
  isEntranceVisible,
  onProfileChange,
  onDisciplinesSaved,
  onPhotoChanged,
  onOpenImage,
  viewerActions,
  reviewsSection,
  postsSection,
}: {
  profile: EngineerPublicProfile;
  isSelf: boolean;
  isEntranceVisible: boolean;
  onProfileChange: (update: ProfileUpdate) => void;
  onDisciplinesSaved: () => void;
  onPhotoChanged: () => void;
  onOpenImage: (url: string) => void;
  viewerActions: ReactNode;
  reviewsSection: ReactNode;
  postsSection: ReactNode;
}): ReactElement {
  // The owner's copy carries the ids needed to edit portfolio and certificates.
  const [ownData, setOwnData] = useState<OwnEngineerData | null>(null);
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const [disciplineSignal, setDisciplineSignal] = useState<number>(0);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isSelf) {
      setOwnData(null);
      return;
    }
    let isActive = true;
    void requestJson("/api/engineers/me", {}, isOwnEngineerData, "").then((result) => {
      // Without it the owner still sees everything, just can't edit files.
      if (isActive && result.data) setOwnData(result.data);
    });
    return () => {
      isActive = false;
    };
  }, [isSelf, profile.userId]);

  const portfolioEntries: PortfolioEntry[] = ownData
    ? ownData.portfolio.map(({ _id, ...item }) => ({ id: _id, ...item }))
    : profile.portfolio.map((item) => ({ id: null, ...item }));
  const certificateEntries: CertificateEntry[] = ownData
    ? ownData.certificates.map((item) => ({
        id: item._id,
        title: item.title,
        uploadedAt: item.uploadedAt,
        fileUrl: item.fileUrl,
      }))
    : profile.certificates.map((item) => ({
        id: null,
        title: item.title,
        uploadedAt: item.uploadedAt,
        fileUrl: item.fileUrl ?? null,
      }));

  const fixTask = (task: EngineerTask): void => {
    if (task === "photo") {
      photoInputRef.current?.click();
      return;
    }
    if (task === "speciality") {
      setDisciplineSignal((signal) => signal + 1);
      return;
    }
    setOpenRequest((current) => ({ task, nonce: (current?.nonce ?? 0) + 1 }));
  };

  const entrance = (order: number): { className: string; style: CSSProperties } => ({
    className: `transition-all duration-[350ms] ease-out ${
      isEntranceVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
    }`,
    style: { transitionDelay: `${order * 80}ms` },
  });

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <EngineerSidebar
        profile={profile}
        isSelf={isSelf}
        portfolioCount={portfolioEntries.length}
        certificateCount={certificateEntries.length}
        photoInputRef={photoInputRef}
        disciplineSignal={disciplineSignal}
        onPhotoChanged={(photoUrl) => {
          onProfileChange((current) => ({ ...current, profilePhotoUrl: photoUrl }));
          onPhotoChanged();
        }}
        onDisciplinesSaved={onDisciplinesSaved}
        viewerActions={viewerActions}
        entrance={entrance(0)}
      />

      <div className="min-w-0 flex-1 space-y-4">
        {isSelf ? (
          <ProfileChecklist
            items={buildChecklist(profile, portfolioEntries.length, certificateEntries.length)}
            intro="Clients read this page before they invite you to bid. A complete profile gets more invitations."
            onFix={fixTask}
          />
        ) : null}

        <AboutSection
          bio={profile.bio}
          isSelf={isSelf}
          openRequest={openRequest}
          onSaved={(bio) => onProfileChange((current) => ({ ...current, bio }))}
          entrance={entrance(1)}
        />

        <RateLocationSection
          profile={profile}
          isSelf={isSelf}
          openRequest={openRequest}
          onSaved={(update) => onProfileChange((current) => ({ ...current, ...update }))}
          entrance={entrance(2)}
        />

        <ExperienceSection
          entries={profile.experience}
          isSelf={isSelf}
          openRequest={openRequest}
          onSaved={(experience) => onProfileChange((current) => ({ ...current, experience }))}
        />

        <EducationSection
          entries={profile.education}
          isSelf={isSelf}
          onSaved={(education) => onProfileChange((current) => ({ ...current, education }))}
        />

        {profile.completedWork.length > 0 || isSelf ? (
          <DeliveredProjects
            projects={profile.completedWork}
            headingId="engineer-work"
            emptyText="Projects you finish on CivilHub appear here."
          />
        ) : null}

        {(profile.equipment ?? []).length > 0 ? (
          <ProfileEquipment
            listings={profile.equipment ?? []}
            headingId="engineer-equipment"
            emptyText=""
          />
        ) : null}

        <PortfolioSection
          entries={portfolioEntries}
          isSelf={isSelf}
          openRequest={openRequest}
          onChanged={(portfolio) => {
            setOwnData((current) => (current ? { ...current, portfolio } : current));
            onProfileChange((current) => ({
              ...current,
              portfolio: portfolio.map(({ title, description, imageUrl, uploadedAt }) => ({
                title,
                description,
                imageUrl,
                uploadedAt,
              })),
            }));
          }}
          onOpenImage={onOpenImage}
        />

        <CertificatesSection
          entries={certificateEntries}
          isSelf={isSelf}
          openRequest={openRequest}
          onChanged={(certificates) => {
            setOwnData((current) => (current ? { ...current, certificates } : current));
            onProfileChange((current) => ({
              ...current,
              certificates: certificates.map(({ title, uploadedAt, fileUrl }) => ({
                title,
                uploadedAt,
                fileUrl,
              })),
            }));
          }}
        />

        <div id="engineer-reviews">{reviewsSection}</div>

        <div className={entrance(3).className} style={entrance(3).style}>
          {postsSection}
        </div>
      </div>
    </div>
  );
}
