import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { Account } from "@/pages/types";
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || "all"}
        onValueChange={(v) => onChange(v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value || "all"}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function AccountChoice({
  accounts,
  value,
  onChange,
  all = true,
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  all?: boolean;
}) {
  return (
    <Choice
      label="Account"
      value={value}
      onChange={onChange}
      options={[
        {
          value: "",
          label: all ? "All accounts, including closed" : "Choose account",
        },
        ...accounts.map((a) => ({
          value: a.id,
          label: `${a.name}${a.closedAt ? " · Closed" : ""}${a.archivedAt ? " · Archived" : ""}`,
        })),
      ]}
    />
  );
}
export function DateRange({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>From</Label>
        <Input
          aria-label="From"
          type="date"
          value={from}
          onChange={(e) => onFrom(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>To</Label>
        <Input
          aria-label="To"
          type="date"
          value={to}
          onChange={(e) => onTo(e.target.value)}
        />
      </div>
    </>
  );
}
