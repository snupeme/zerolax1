import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthGate } from "./components/AuthGate";
import { AdminLayout } from "./components/AdminLayout";
import { Layout } from "./components/Layout";
import { ExamsPage } from "./pages/ExamsPage";
import { HomePage } from "./pages/HomePage";
import { SubjectsPage } from "./pages/SubjectsPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { IqPage } from "./pages/IqPage";
import { IqTestPage } from "./pages/IqTestPage";
import { IqResultPage } from "./pages/IqResultPage";
import { EntranceListPage } from "./pages/EntranceListPage";
import { EntranceTestPage } from "./pages/EntranceTestPage";
import { EntranceResultPage } from "./pages/EntranceResultPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SettingsPage } from "./pages/SettingsPage";
import { GiftsPage } from "./pages/GiftsPage";
import { SupportPage } from "./pages/SupportPage";
import { OfferPage } from "./pages/OfferPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage";
import { AdminOverviewPage } from "./pages/admin/AdminOverviewPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminUserDetailPage } from "./pages/admin/AdminUserDetailPage";
import { AdminIqTestsPage } from "./pages/admin/AdminIqTestsPage";
import { AdminIqTestEditorPage } from "./pages/admin/AdminIqTestEditorPage";
import { AdminEntranceTestsPage } from "./pages/admin/AdminEntranceTestsPage";
import { AdminEntranceTestEditorPage } from "./pages/admin/AdminEntranceTestEditorPage";
import { AdminNotificationsPage } from "./pages/admin/AdminNotificationsPage";
import { AdminAuditPage } from "./pages/admin/AdminAuditPage";
import { AdminLearningPage } from "./pages/admin/AdminLearningPage";
const AdminControlPage = lazy(() =>
  import("./pages/admin/AdminControlPage").then((m) => ({
    default: m.AdminControlPage,
  })),
);
const LearningPage = lazy(() =>
  import("./pages/LearningPage").then((m) => ({ default: m.LearningPage })),
);
const CertificatePage = lazy(() =>
  import("./pages/LearningPage").then((m) => ({ default: m.CertificatePage })),
);
const SubjectLearningPage = lazy(() =>
  import("./pages/SubjectLearningPage").then((m) => ({
    default: m.SubjectLearningPage,
  })),
);
const CertificatesPage = lazy(() =>
  import("./pages/CertificatesPage").then((m) => ({
    default: m.CertificatesPage,
  })),
);
const GamesPage=lazy(()=>import('./pages/GamesPage').then(m=>({default:m.GamesPage})));
const AdminGamesPage=lazy(()=>import('./pages/admin/AdminGamesPage').then(m=>({default:m.AdminGamesPage})));
const ProgressPage = lazy(() =>
  import("./pages/ProgressPage").then((m) => ({ default: m.ProgressPage })),
);
const MissionsPage = lazy(() =>
  import("./pages/MissionsPage").then((m) => ({ default: m.MissionsPage })),
);
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage").then((m) => ({ default: m.LeaderboardPage })),
);
const FlashcardsPage = lazy(() =>
  import("./pages/FlashcardsPage").then((m) => ({ default: m.FlashcardsPage })),
);
const FlashcardDeckPage = lazy(() =>
  import("./pages/FlashcardDeckPage").then((m) => ({
    default: m.FlashcardDeckPage,
  })),
);
const MistakesPage = lazy(() =>
  import("./pages/MistakesPage").then((m) => ({ default: m.MistakesPage })),
);
const AchievementsPage = lazy(() =>
  import("./pages/AchievementsPage").then((m) => ({
    default: m.AchievementsPage,
  })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })),
);
const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const AdminEdtechPage = lazy(() =>
  import("./pages/admin/AdminEdtechPage").then((m) => ({
    default: m.AdminEdtechPage,
  })),
);

function LegacyGamesRedirect(){
  const {pathname,search,hash}=useLocation();
  const target=pathname.startsWith('/games/play/')?'/exams/games':pathname.replace(/^\/games(?=\/|$)/,'/exams/games');
  return <Navigate to={target+search+hash} replace/>;
}

export function App() {
  return (
    <Suspense
      fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}
    >
      <Routes>
        <Route path="/certificates/:id" element={<CertificatePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminControlPage />} />
          <Route
            path="/admin/control/:section"
            element={<AdminControlPage />}
          />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
          <Route path="/admin/iq" element={<AdminIqTestsPage />} />
          <Route path="/admin/iq/:id" element={<AdminIqTestEditorPage />} />
          <Route path="/admin/entrance" element={<AdminEntranceTestsPage />} />
          <Route
            path="/admin/entrance/:id"
            element={<AdminEntranceTestEditorPage />}
          />
          <Route
            path="/admin/notifications"
            element={<AdminNotificationsPage />}
          />
          <Route path="/admin/audit" element={<AdminAuditPage />} />
          <Route path="/admin/learning" element={<AdminLearningPage />} />
          <Route path="/admin/games" element={<AdminGamesPage/>}/>
          <Route path="/admin/edtech" element={<AdminEdtechPage />} />
        </Route>

        <Route element={<AuthGate />}>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="analysis" element={<AnalysisPage />} />
            <Route path="exams" element={<ExamsPage/>}/>
            <Route path="games/*" element={<LegacyGamesRedirect/>}/>
            <Route path="exams/games" element={<GamesPage view="home"/>}/>
            <Route path="exams/games/history" element={<GamesPage view="history"/>}/>
            <Route path="exams/games/round/:sessionId" element={<GamesPage view="play"/>}/>
            <Route path="exams/games/play/:sessionId" element={<Navigate to="/exams/games" replace/>}/>
            <Route path="exams/games/:gameId" element={<GamesPage view="setup"/>}/>
            {(["algebra", "geometry"] as const).map((subject) => (
              <Route key={subject} path={subject}>
                <Route
                  index
                  element={
                    <SubjectLearningPage subject={subject} view="grades" />
                  }
                />
                <Route
                  path="grades/:gradeId"
                  element={
                    <SubjectLearningPage subject={subject} view="books" />
                  }
                />
                <Route
                  path="grades/:gradeId/books"
                  element={
                    <SubjectLearningPage subject={subject} view="books" />
                  }
                />
                <Route
                  path="grades/:gradeId/books/:bookId/topics"
                  element={
                    <SubjectLearningPage subject={subject} view="topics" />
                  }
                />
                <Route
                  path="grades/:gradeId/books/:bookId/topics/:topicId"
                  element={
                    <SubjectLearningPage subject={subject} view="topic" />
                  }
                />
                <Route
                  path="grades/:gradeId/books/:bookId/attempts/:attemptId"
                  element={
                    <SubjectLearningPage subject={subject} view="attempt" />
                  }
                />
              </Route>
            ))}
            <Route path="certificates" element={<CertificatesPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/learning/books/:bookId" element={<LearningPage />} />
            <Route
              path="/learning/books/:bookId/attempts/:attemptId"
              element={<LearningPage />}
            />
            <Route
              path="/learning/attempts/:attemptId"
              element={<LearningPage />}
            />
            <Route path="/iq" element={<IqPage />} />
            <Route path="/iq/play/:testId" element={<IqTestPage />} />
            <Route path="/iq/result/:testId" element={<IqResultPage />} />
            <Route path="/entrance" element={<EntranceListPage />} />
            <Route
              path="/entrance/play/:testId"
              element={<EntranceTestPage />}
            />
            <Route
              path="/entrance/result/:attemptId"
              element={<EntranceResultPage />}
            />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/missions" element={<MissionsPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/flashcards" element={<FlashcardsPage />} />
            <Route path="/flashcards/:deckId" element={<FlashcardDeckPage />} />
            <Route path="/mistakes" element={<MistakesPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/gifts" element={<GiftsPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/offer" element={<OfferPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
