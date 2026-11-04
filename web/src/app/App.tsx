import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createQueryClient } from "@/api";
import { router } from "./router";

const defaultClient = createQueryClient();

export function App({ queryClient = defaultClient, appRouter = router }: { queryClient?: QueryClient; appRouter?: typeof router }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  );
}
