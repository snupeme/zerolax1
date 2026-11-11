import { useEffect } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { request } from "./lib/api";
import { BrowserRouter, useLocation } from "react-router-dom";
import { I18nProvider } from "./i18n/I18nProvider";
import { ThemeProvider } from "./lib/theme";
import { AdminAuthProvider } from "./auth/AdminAuthProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { App } from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  return null;
}
function PublicBranding() {
  const q = useQuery({
    queryKey: ["public-platform"],
    queryFn: () =>
      request<{ name: string; faviconUrl: string }>("/api/content/config", {
        auth: "none",
      }),
    staleTime: 60000,
  });
  useEffect(() => {
    if (!q.data) return;
    document.title = q.data.name;
    if (q.data.faviconUrl) {
      let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!icon) {
        icon = document.createElement("link");
        icon.rel = "icon";
        document.head.appendChild(icon);
      }
      icon.href = q.data.faviconUrl;
    }
  }, [q.data]);
  return null;
}

export function Root() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <PublicBranding />
          <AdminAuthProvider>
            <BrowserRouter>
              <AuthProvider>
                <ScrollToTop />
                <App />
              </AuthProvider>
            </BrowserRouter>
          </AdminAuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
