import { useState } from "react";
import { useMembers } from "@/features/queries";
import { PageHeader } from "@/ui";
import { Tiles } from "./Tiles";

export function SettingsScreen() {
  const { data: members = [] } = useMembers();
  const [id, setId] = useState<string | null>(null);
  const subtitle = !id && members.length ? `Household · ${members.map((m) => m.name).join(" & ")}` : undefined;
  return (
    <>
      <PageHeader title="Settings" subtitle={subtitle} onBack={id ? () => setId(null) : undefined} />
      <Tiles id={id} onOpen={setId} />
    </>
  );
}
