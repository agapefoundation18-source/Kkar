import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { mergeWaitlistMessage } from "@shared/waitlistMailMerge";
import { Archive, Check, Clock3, Download, FileEdit, Inbox, Mail, MailPlus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type MailboxFolder = "inbox" | "outbox" | "drafts" | "compose" | "waitlist";

const folders: Array<{ id: MailboxFolder; label: string; icon: typeof Inbox }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "outbox", label: "Outbox", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
  { id: "compose", label: "Compose", icon: MailPlus },
  { id: "waitlist", label: "Waitlist", icon: Archive },
];

export default function AdminMailbox() {
  const utils = trpc.useUtils();
  const waitlist = trpc.operations.launchWaitlist.useQuery();
  const drafts = trpc.operations.launchWaitlistDrafts.useQuery();
  const saveDraft = trpc.operations.saveWaitlistDraft.useMutation({
    onSuccess: async result => {
      toast.success(`Draft saved for ${result.recipientCount} selected recipient${result.recipientCount === 1 ? "" : "s"}.`);
      await utils.operations.launchWaitlistDrafts.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const removeEntries = trpc.operations.removeLaunchWaitlistEntries.useMutation({
    onSuccess: async result => {
      toast.success(`${result.removedCount} waitlist entr${result.removedCount === 1 ? "y" : "ies"} removed.`);
      setSelected([]);
      await utils.operations.launchWaitlist.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const [activeFolder, setActiveFolder] = useState<MailboxFolder>("waitlist");
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState("");

  const recipients = waitlist.data ?? [];
  const selectedRecipients = useMemo(
    () => recipients.filter(recipient => selected.includes(recipient.email)),
    [recipients, selected],
  );
  const selectedDraft = drafts.data?.find(draft => draft.id === selectedDraftId);

  const toggleRecipient = (email: string) => {
    setSelected(current => current.includes(email) ? current.filter(item => item !== email) : [...current, email]);
  };

  const toggleAll = () => {
    if (selected.length === recipients.length) setSelected([]);
    else setSelected(recipients.map(recipient => recipient.email));
  };

  const exportWaitlist = () => {
    const csv = ["Email,Joined at", ...recipients.map(entry =>
      `"${entry.email.replaceAll('"', '""')}","${new Date(entry.joinedAt).toISOString()}"`,
    )].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kkar-launch-waitlist.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadDraft = (id: string) => {
    setSelectedDraftId(id);
    const draft = drafts.data?.find(item => item.id === id);
    if (!draft) return;
    setSubject(draft.subject);
    setBody(draft.body);
    const available = new Set(recipients.map(recipient => recipient.email));
    setSelected(draft.recipients.filter(email => available.has(email)));
    setShowPreview(false);
    toast.info("Draft loaded. Review the selected recipients before saving.");
  };

  return (
    <div className="space-y-6">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Admin / Mailbox</div>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Launch mailbox.</h1>
      <p className="mt-2 text-sm text-[#7b9490]">Manage launch sign-ups and prepare personalized announcements.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-[#e0ece8] bg-white p-3">
        <Button
          variant="outline"
          disabled
          className="mb-4 h-11 w-full justify-start rounded-xl border-[#dcebe5] text-[#8da29e]"
          title="Email sending will be enabled after a sender address is configured."
        >
          <MailPlus className="mr-2 h-4 w-4" /> Compose
        </Button>
        <nav aria-label="Mailbox folders" className="space-y-1">
          {folders.map(folder => {
            const Icon = folder.icon;
            const active = folder.id === "waitlist";
            return (
              <button
                key={folder.id}
                type="button"
                disabled={!active}
                onClick={() => active && setActiveFolder(folder.id)}
                title={active ? undefined : "Available after a sender email address is configured."}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold ${activeFolder === folder.id ? "bg-[#e7f4ee] text-[#2f7e70]" : active ? "text-[#78918d] hover:bg-[#f3f8f5]" : "cursor-not-allowed text-[#b0bfbc]"}`}
              >
                <Icon className="h-4 w-4" /> {folder.label}
                {folder.id === "waitlist" && <Badge className="ml-auto bg-white text-[#4f897d] hover:bg-white">{recipients.length}</Badge>}
                {folder.id !== "waitlist" && <span className="ml-auto text-[9px] font-semibold">Not set up</span>}
              </button>
            );
          })}
        </nav>
        <div className="mt-5 rounded-xl bg-[#fff8e7] p-3 text-[11px] leading-relaxed text-[#846b38]">
          <div className="flex items-center gap-2 font-extrabold"><Clock3 className="h-3.5 w-3.5" /> Sending is off</div>
          <p className="mt-1">Inbox, outbox, drafts, compose, and sending will activate when a sender email is configured.</p>
        </div>
      </aside>

      <section className="min-w-0 space-y-5">
        {activeFolder === "waitlist" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#e0ece8] bg-white p-4 sm:px-5">
              <div>
                <div className="flex items-center gap-2 text-base font-black text-[#193d3c]"><Archive className="h-4 w-4 text-[#4b9b86]" /> Waitlist</div>
                <p className="mt-1 text-xs text-[#819a95]">Each address is stored once; joining again does not reset its original join date.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[#e6f5ee] text-[#3a8c78] hover:bg-[#e6f5ee]">{recipients.length} joined</Badge>
                <Button variant="outline" size="sm" disabled={!recipients.length} onClick={exportWaitlist} className="rounded-lg border-[#dcebe5]"><Download className="mr-2 h-3.5 w-3.5" /> Export CSV</Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selected.length || removeEntries.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${selected.length} selected waitlist entr${selected.length === 1 ? "y" : "ies"}?`)) {
                      removeEntries.mutate({ emails: selected });
                    }
                  }}
                  className="rounded-lg border-[#f0d9d4] text-[#a85d52] hover:bg-[#fff5f2]"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove selected
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-[#e0ece8] bg-white">
              {waitlist.isLoading ? <p className="p-8 text-sm text-[#809792]">Loading waitlist…</p>
                : waitlist.error ? <p className="m-4 rounded-xl bg-[#fff2ef] p-4 text-sm text-[#a85d52]">{waitlist.error.message}</p>
                : recipients.length ? (
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[#f5faf7] text-[10px] font-black uppercase tracking-wide text-[#819a95]">
                        <tr>
                          <th className="w-12 px-4 py-3"><input aria-label="Select all waitlist recipients" type="checkbox" checked={selected.length === recipients.length && recipients.length > 0} onChange={toggleAll} className="h-4 w-4 accent-[#3f967f]" /></th>
                          <th className="px-4 py-3">Email address</th>
                          <th className="px-4 py-3">Joined at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipients.map(entry => (
                          <tr key={entry.email} className="border-t border-[#edf3f0] text-[#456660] hover:bg-[#fbfdfc]">
                            <td className="px-4 py-3"><input aria-label={`Select ${entry.email}`} type="checkbox" checked={selected.includes(entry.email)} onChange={() => toggleRecipient(entry.email)} className="h-4 w-4 accent-[#3f967f]" /></td>
                            <td className="px-4 py-3 font-medium">{entry.email}</td>
                            <td className="px-4 py-3 text-xs text-[#819a95]">{new Date(entry.joinedAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="p-10 text-center text-sm text-[#87a09a]">No one has joined the waitlist yet.</div>}
            </div>

            <div className="rounded-[24px] border border-[#e0ece8] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-base font-black text-[#193d3c]"><Mail className="h-4 w-4 text-[#4b9b86]" /> Personalized announcement</div>
                  <p className="mt-1 text-xs text-[#819a95]">Select recipients, write a reusable template, preview each personalized copy, then save it as a draft.</p>
                </div>
                <Badge className="bg-[#fff3d7] text-[#a8781d] hover:bg-[#fff3d7]">{selected.length} selected</Badge>
              </div>
              <div className="mt-4 grid gap-3">
                {drafts.error && <p role="alert" className="rounded-xl bg-[#fff2ef] p-3 text-sm text-[#a85d52]">{drafts.error.message}</p>}
                {drafts.data?.length ? (
                  <label className="block text-xs font-bold text-[#67837d]">
                    Load a saved draft
                    <select value={selectedDraftId} onChange={event => loadDraft(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#dcebe5] bg-white px-3 text-sm font-normal text-[#456660]">
                      <option value="">Start a new message…</option>
                      {drafts.data.map(draft => <option key={draft.id} value={draft.id}>{draft.subject} · {new Date(draft.updatedAt).toLocaleString()}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="block text-xs font-bold text-[#67837d]">
                  Subject
                  <Input value={subject} maxLength={255} onChange={event => setSubject(event.target.value)} placeholder="Kkary is getting ready to launch" className="mt-1.5 h-11 rounded-xl" />
                </label>
                <label className="block text-xs font-bold text-[#67837d]">
                  Message
                  <textarea value={body} maxLength={10000} onChange={event => setBody(event.target.value)} rows={6} placeholder={"Hello {{email}},\n\nThanks for joining the Kkary launch waitlist. We’ll be in touch with more details soon.\n\nThe Kkary team"} className="mt-1.5 w-full rounded-xl border border-[#dcebe5] p-3 text-sm font-normal leading-relaxed text-[#355754] outline-none focus:ring-2 focus:ring-[#91c8b5]" />
                </label>
                <div className="rounded-xl bg-[#f5faf7] p-3 text-xs leading-relaxed text-[#64807a]">
                  Personalization fields: <code className="rounded bg-white px-1.5 py-0.5">{"{{email}}"}</code>, <code className="rounded bg-white px-1.5 py-0.5">{"{{joinedDate}}"}</code>, and <code className="rounded bg-white px-1.5 py-0.5">{"{{joinedAt}}"}</code>.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!selected.length || !body.trim()} onClick={() => setShowPreview(value => !value)} className="rounded-xl border-[#dcebe5]">
                    {showPreview ? "Hide preview" : "Preview personalized messages"}
                  </Button>
                  <Button disabled={!selected.length || !subject.trim() || !body.trim() || saveDraft.isPending} onClick={() => saveDraft.mutate({ subject, body, recipients: selected })} className="rounded-xl bg-[#113a3b] text-white hover:bg-[#1e5555]">
                    <FileEdit className="mr-2 h-4 w-4" /> {saveDraft.isPending ? "Saving…" : "Save as draft"}
                  </Button>
                  <Button disabled title="Configure a sender email before sending." className="cursor-not-allowed rounded-xl bg-[#d9e4e0] text-[#758e88]">
                    <Send className="mr-2 h-4 w-4" /> Send unavailable
                  </Button>
                </div>
              </div>

              {showPreview && (
                <div className="mt-5 space-y-3 border-t border-[#e5efeb] pt-5">
                  <div className="text-xs font-black uppercase tracking-wide text-[#729088]">Personalized previews</div>
                  {selectedRecipients.map(recipient => (
                    <article key={recipient.email} className="rounded-xl border border-[#e2eee9] bg-[#fcfefd] p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[#355754]"><Check className="h-3.5 w-3.5 text-[#4b9b86]" /> To: {recipient.email}</div>
                      <div className="text-xs font-bold text-[#4a6c65]">{mergeWaitlistMessage(subject || "(No subject)", recipient)}</div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#67817b]">{mergeWaitlistMessage(body, recipient)}</p>
                    </article>
                  ))}
                  {!selectedRecipients.length && <p className="text-sm text-[#809792]">Select at least one current waitlist recipient to preview.</p>}
                </div>
              )}
            </div>
          </>
        )}
        {activeFolder !== "waitlist" && <div className="rounded-[24px] border border-dashed border-[#cfe2db] bg-white p-10 text-center text-sm text-[#87a09a]">This mailbox section is inactive until a sender email address is configured.</div>}
      </section>
    </div>
    </div>
  );
}
