import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { VisitTracker } from "./components/analytics/VisitTracker";
import { HomePage } from "./routes/HomePage";
import { NewImportPage } from "./routes/NewImportPage";
import { HistoryPage } from "./routes/HistoryPage";
import { ImportDetailPage } from "./routes/ImportDetailPage";
import { MappingPage } from "./routes/MappingPage";
import { ExtractPage } from "./routes/ExtractPage";

export default function App() {
  return (
    <AppShell>
      <VisitTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/imports/new" element={<NewImportPage />} />
        <Route path="/imports" element={<HistoryPage />} />
        <Route path="/imports/:id/map" element={<MappingPage />} />
        <Route path="/imports/:id/extract" element={<ExtractPage />} />
        <Route path="/imports/:id" element={<ImportDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
