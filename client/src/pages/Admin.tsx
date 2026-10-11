import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import AdminMailbox from "@/components/AdminMailbox";
import { BulkDocumentReview, CommissionHistory, SandboxPaymentTest } from "@/components/AdminEnhancements";
import { PricingRulesManager } from "@/components/PricingRulesManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowRight, Bike, CalendarClock, Check, ChevronRight, CircleAlert, CreditCard, Download, FileCheck2, KeyRound, LayoutDashboard, LockKeyhole, Mail as MailboxIcon, Mail as MailIcon, MapPin, Navigation, Plus, Rocket, ShieldCheck, Users, WalletCards, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

type Section = "overview" | "drivers" | "finance" | "admins" | "messages" | "mailbox" | "releases" | "launch";
const money = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;

function Mark() { return <div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4b942] text-[#113a3b]"><Navigation className="h-5 w-5 fill-current" /></div><div><div className="text-[16px] font-black tracking-[-0.06em] text-[#113a3b]">Kkary</div><div className="text-[8px] font-black uppercase tracking-[0.15em] text-[#7e9691]">Admin console</div></div></div>; }

function Login() {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.admin.login.useMutation({
    onSuccess: async result => {
      await utils.auth.me.invalidate();
      toast.success(result.mustChangePassword ? "Welcome. Secure your account to continue." : "Welcome back");
    },
    onError: error => toast.error(error.message),
  });
  return <div className="flex min-h-screen items-center justify-center bg-[#eef7f3] px-5"><div className="w-full max-w-[420px] rounded-[30px] border border-[#dcebe5] bg-white p-8 shadow-[0_25px_70px_rgba(20,70,65,0.12)]"><Mark /><div className="mt-10"><div className="mb-2 text-[10px] font-black uppercase tracking-[0.17em] text-[#5e948b]">Restricted access</div><h1 className="text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Sign in to Admin.</h1></div><form autoComplete="off" onSubmit={event => { event.preventDefault(); login.mutate({ username, password }); }} className="mt-7 space-y-4"><label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">Username</span><Input name="admin-login-username" value={username} onChange={event => setUsername(event.target.value)} className="h-12 rounded-xl border-[#dcebe5]" autoComplete="off" /></label><label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">Password</span><Input name="admin-login-password" value={password} onChange={event => setPassword(event.target.value)} type="password" className="h-12 rounded-xl border-[#dcebe5]" autoComplete="new-password" /></label><Button disabled={login.isPending || !username.trim() || !password} className="h-13 mt-3 w-full rounded-xl bg-[#113a3b] text-white hover:bg-[#1e5555]">{login.isPending ? "Checking…" : "Enter console"}<ArrowRight className="ml-auto h-4 w-4" /></Button></form></div></div>;
}

function InitialAdminSetup({ username: currentUsername, onDone }: { username: string; onDone: () => Promise<void> }) {
  const change = trpc.admin.completeInitialSetup.useMutation({
    onSuccess: async () => {
      toast.success("Credentials updated. Sign in with your new username and password.");
      await onDone();
    },
    onError: error => toast.error(error.message),
  });
  const [username, setUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#103839]/60 px-5 backdrop-blur-sm"><div className="w-full max-w-[440px] rounded-[28px] bg-white p-7 shadow-2xl"><div className="flex items-start justify-between"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-[#c0851d]"><KeyRound className="h-4 w-4" /> Action required</div><h2 className="text-2xl font-black tracking-[-0.05em] text-[#173b3b]">Secure your account</h2></div><LockKeyhole className="h-5 w-5 text-[#658e88]" /></div><p className="mt-3 text-sm leading-relaxed text-[#7d9490]">Choose a new administrator username and password before using the console.</p><form autoComplete="off" onSubmit={event => { event.preventDefault(); change.mutate({ currentPassword, username, newPassword }); }} className="mt-6 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#67837d]">Current username</span><Input name="admin-new-username" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} placeholder="Administrator username" className="h-12 rounded-xl" /></label><Input name="admin-current-password" type="password" autoComplete="new-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Current password" className="h-12 rounded-xl" /><Input name="admin-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password (10+ characters)" className="h-12 rounded-xl" /><Button disabled={change.isPending || username.trim().length < 3 || !currentPassword || newPassword.length < 10} className="h-12 w-full rounded-xl bg-[#113a3b] text-white">{change.isPending ? "Saving…" : "Update username and password"}</Button></form></div></div>;
}

function Sidebar({ active, setActive, role }: { active: Section; setActive: (section: Section) => void; role: string }) {
  const items = [{ id: "overview" as const, label: "Overview", icon: LayoutDashboard }, { id: "drivers" as const, label: "Driver review", icon: FileCheck2 }, { id: "finance" as const, label: "Pricing & share", icon: WalletCards }, { id: "messages" as const, label: "User messages", icon: MailIcon }, ...(role === "admin" || role === "super_admin" ? [{ id: "mailbox" as const, label: "Mailbox", icon: MailboxIcon }, { id: "launch" as const, label: "Launch page", icon: CalendarClock }, { id: "releases" as const, label: "App releases", icon: Rocket }] : []), ...(role === "super_admin" ? [{ id: "admins" as const, label: "Administrators", icon: Users }] : [])];
  return <aside className="hidden w-[250px] shrink-0 border-r border-[#dcebe5] bg-white p-5 lg:block"><Mark /><div className="mt-10 space-y-1">{items.map(item => <button key={item.id} onClick={() => setActive(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold transition-all ${active === item.id ? "bg-[#e7f4ee] text-[#2f7e70]" : "text-[#78918d] hover:bg-[#f3f8f5]"}`}><item.icon className="h-4 w-4" /> {item.label}</button>)}</div><div className="mt-auto pt-44"><div className="rounded-2xl bg-[#f3f8f5] p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#548278]"><ShieldCheck className="h-4 w-4" /> Protected</div><p className="mt-2 text-[11px] leading-relaxed text-[#7d9591]">Every review and revenue change is recorded in the audit log.</p></div></div></aside>;
}

function AppReleases() {
  const utils = trpc.useUtils();
  const status = trpc.operations.releaseStatus.useQuery();
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const publishVersion = trpc.operations.publishAppVersion.useMutation({
    onSuccess: async release => {
      toast.success(`Version ${release.version} is now available to outdated apps`);
      setVersion("");
      setNotes("");
      await utils.operations.releaseStatus.invalidate();
      await utils.operations.appRelease.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const publishDeployment = trpc.operations.publishCurrentDeployment.useMutation({
    onSuccess: async () => {
      toast.success("Vercel accepted the deployment request");
      await utils.operations.releaseStatus.invalidate();
      await utils.operations.appRelease.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const currentRelease = status.data?.release;

  return <div className="space-y-6">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Admin / App releases</div>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Publish app changes.</h1>
      <p className="mt-2 text-sm text-[#7b9490]">Choose whether this deployment is a versioned app update or a routine publish.</p>
    </div>
    <Card className="rounded-[26px] border-[#e0ece8]">
      <CardHeader><CardTitle className="text-base text-[#193d3c]">Current published version</CardTitle></CardHeader>
      <CardContent>
        {currentRelease
          ? <div className="rounded-2xl bg-[#edf7f2] p-4 text-sm text-[#436e65]">
            <div className="font-black">Version {currentRelease.version}</div>
            <div className="mt-1 text-xs">Published {new Date(currentRelease.publishedAt).toLocaleString()}</div>
            <div className="mt-2 text-xs">{currentRelease.promptForUpdate ? "Update prompt enabled for this version." : "Routine publish; no update prompt will be shown."}</div>
          </div>
          : <p className="text-sm text-[#7b9490]">{status.isLoading ? "Loading release status…" : "No app version has been published yet."}</p>}
      </CardContent>
    </Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="rounded-[26px] border-[#e0ece8]">
        <CardHeader><CardTitle className="text-base text-[#193d3c]">Publish as a new version</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={event => { event.preventDefault(); publishVersion.mutate({ version, notes }); }} className="space-y-3">
            <label className="block text-xs font-bold text-[#67837d]">New version number (for example 1.2.0)</label>
            <Input value={version} onChange={event => setVersion(event.target.value)} placeholder="1.0.0" required className="h-11 rounded-xl" />
            <label className="block text-xs font-bold text-[#67837d]">What changed? (optional)</label>
            <textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} rows={4} className="w-full rounded-xl border border-[#dcebe5] p-3 text-sm" placeholder="Describe this release for riders and drivers." />
            <Button disabled={publishVersion.isPending || !version.trim()} className="h-11 w-full rounded-xl bg-[#113a3b] text-white">
              {publishVersion.isPending ? "Publishing…" : "Publish new version"}
            </Button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-[#809792]">Outdated installed apps will see an Update button in Settings. The version must be newer than the last published version.</p>
        </CardContent>
      </Card>
      <Card className="rounded-[26px] border-[#e0ece8]">
        <CardHeader><CardTitle className="text-base text-[#193d3c]">Just publish</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-[#78918e]">Request a Vercel deployment without publishing a new app version or showing a new update prompt.</p>
          <Button
            onClick={() => publishDeployment.mutate()}
            disabled={publishDeployment.isPending || !status.data?.deployHookConfigured}
            className="mt-5 h-11 w-full rounded-xl bg-[#4ea88e] text-white hover:bg-[#3d9178]"
          >
            <Rocket className="mr-2 h-4 w-4" />
            {publishDeployment.isPending ? "Requesting deployment…" : "Publish current changes"}
          </Button>
          {!status.data?.deployHookConfigured && (
            <p className="mt-3 text-xs leading-relaxed text-[#9a6e22]">Set the server-side VERCEL_DEPLOY_HOOK_URL environment variable to enable this option.</p>
          )}
        </CardContent>
      </Card>
    </div>
  </div>;
}

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function LaunchPageSettings({ onOpenMailbox }: { onOpenMailbox: () => void }) {
  const utils = trpc.useUtils();
  const status = trpc.operations.launchStatus.useQuery();
  const waitlist = trpc.operations.launchWaitlist.useQuery();
  const [enabled, setEnabled] = useState(false);
  const [launchAt, setLaunchAt] = useState("");
  const save = trpc.operations.saveLaunchMode.useMutation({
    onSuccess: async config => {
      setEnabled(config.enabled);
      setLaunchAt(toLocalDateTime(config.launchAt));
      toast.success(config.enabled ? "Coming soon page is live" : "Coming soon page is off");
      await utils.operations.launchStatus.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!status.data) return;
    setEnabled(status.data.enabled);
    setLaunchAt(toLocalDateTime(status.data.launchAt));
  }, [status.data?.enabled, status.data?.launchAt]);

  return <div className="space-y-6">
    <div>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Admin / Launch page</div>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Prepare the public launch.</h1>
      <p className="mt-2 text-sm text-[#7b9490]">Control the coming soon page shown to visitors on the Rider and Driver app URLs.</p>
    </div>
    <Card className="rounded-[26px] border-[#e0ece8]">
      <CardHeader><CardTitle className="text-base text-[#193d3c]">Coming soon page</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#f5faf7] p-4">
          <div>
            <div className="text-sm font-extrabold text-[#355754]">{enabled ? "Coming soon page is enabled" : "Rider and Driver apps are public"}</div>
            <p className="mt-1 text-xs text-[#819a95]">When enabled, visitors see the launch countdown and waitlist instead of the apps.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[#456660]">
            <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="h-4 w-4 accent-[#3f967f]" />
            Enable coming soon
          </label>
        </div>
        <label className="mt-5 block text-xs font-bold text-[#67837d]" htmlFor="launch-at">Planned launch date and time</label>
        <Input id="launch-at" type="datetime-local" value={launchAt} onChange={event => setLaunchAt(event.target.value)} className="mt-2 h-11 max-w-md rounded-xl" />
        <p className="mt-2 text-xs text-[#809792]">The countdown uses this time in your local timezone. Visitors see the equivalent time in their own timezone.</p>
        {enabled && !launchAt && <p className="mt-2 text-xs font-semibold text-[#aa6d27]">Choose a date and time before enabling the page.</p>}
        <Button
          onClick={() => save.mutate({ enabled, launchAt: launchAt ? new Date(launchAt).toISOString() : null })}
          disabled={status.isLoading || save.isPending || (enabled && !launchAt)}
          className="mt-5 h-11 rounded-xl bg-[#113a3b] px-5 text-white hover:bg-[#1e5555]"
        >
          {save.isPending ? "Saving…" : "Save launch settings"}
        </Button>
      </CardContent>
    </Card>
    <Card className="rounded-[26px] border-[#e0ece8]">
      <CardHeader><CardTitle className="text-base text-[#193d3c]">Launch waitlist mailbox</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[#78918e]">{waitlist.isLoading ? "Loading waitlist…" : waitlist.error ? waitlist.error.message : `${waitlist.data?.length ?? 0} people have joined. View recipients and prepare a personalized announcement in Mailbox.`}</p>
        <Button onClick={onOpenMailbox} className="rounded-xl bg-[#113a3b] text-white hover:bg-[#1e5555]"><MailboxIcon className="mr-2 h-4 w-4" /> Open mailbox</Button>
      </CardContent>
    </Card>
  </div>;
}

function LiveMap({ drivers }: { drivers: Array<{ id: number; defaultLga: string; currentLat: number | null; currentLng: number | null }> }) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    markersRef.current.forEach(marker => { marker.map = null; });
    markersRef.current = drivers.filter(driver => driver.currentLat !== null && driver.currentLng !== null).map(driver => new google.maps.marker.AdvancedMarkerElement({ map: mapRef.current!, position: { lat: Number(driver.currentLat), lng: Number(driver.currentLng) }, title: `Driver #${driver.id} · ${driver.defaultLga}` }));
    return () => { markersRef.current.forEach(marker => { marker.map = null; }); };
  }, [drivers]);
  return <Card className="overflow-hidden rounded-[26px] border-[#e0ece8]"><CardHeader><CardTitle className="text-base text-[#193d3c]">Network map</CardTitle><p className="mt-1 text-xs text-[#89a19d]">Online driver signals across Akwa Ibom · auto-refreshing</p></CardHeader><CardContent className="p-0"><MapView className="h-[360px]" initialCenter={{ lat: 5.0513, lng: 7.9335 }} initialZoom={9} onMapReady={map => { mapRef.current = map; }} /></CardContent></Card>;
}

function Overview() {
  const snapshot = trpc.operations.snapshot.useQuery();
  const liveDrivers = trpc.operations.liveDrivers.useQuery(undefined, { refetchInterval: 5000 });
  const data = snapshot.data ?? { riderCount: 0, driverCount: 0, activeDriverCount: 0, activeRideCount: 0, completedRideCount: 0, cancelledRideCount: 0, revenueKobo: 0 };
  const stats = [{ label: "Registered riders", value: data.riderCount.toLocaleString(), icon: Users }, { label: "Online drivers", value: data.activeDriverCount.toLocaleString(), icon: Bike }, { label: "Live trips", value: data.activeRideCount.toLocaleString(), icon: Navigation }, { label: "Gross revenue", value: money(data.revenueKobo), icon: WalletCards }];
  return <div className="space-y-6"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Operations / Overview</div><h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">The network, live.</h1><p className="mt-2 text-sm text-[#7b9490]">A live view of the Kkary network across Akwa Ibom.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat => <div key={stat.label} className="rounded-2xl border border-[#e0ece8] bg-white p-4"><div className="flex items-center justify-between"><div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8ba39e]">{stat.label}</div><stat.icon className="h-4 w-4 text-[#65a296]" /></div><div className="mt-3 text-2xl font-black tracking-[-0.05em] text-[#234744]">{stat.value}</div></div>)}</div><div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base text-[#193d3c]">Live driver signals</CardTitle><p className="mt-1 text-xs text-[#89a19d]">Refreshes every 5 seconds</p></div><Badge className="bg-[#e6f5ee] text-[#3a8c78] hover:bg-[#e6f5ee]">{liveDrivers.data?.length ?? 0} online</Badge></CardHeader><CardContent className="space-y-2">{liveDrivers.data?.length ? liveDrivers.data.map(driver => <div key={driver.id} className="flex items-center gap-3 rounded-xl bg-[#f6faf8] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#dff1e8] text-[#398c78]"><MapPin className="h-4 w-4" /></div><div className="flex-1"><div className="text-sm font-bold text-[#456660]">Driver #{driver.id} · {driver.defaultLga}</div><div className="text-[10px] text-[#8aa29d]">{driver.currentLat?.toFixed(4)}, {driver.currentLng?.toFixed(4)}</div></div><span className="h-2 w-2 rounded-full bg-[#4ea88e]" /></div>) : <div className="rounded-2xl border border-dashed border-[#cfe2db] p-10 text-center text-sm text-[#87a09a]">No live driver location signals yet.</div>}</CardContent></Card><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader><CardTitle className="text-base text-[#193d3c]">Control notes</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-[#718b86]"><div className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#4c9c87]" /> Commission changes are audited</div><div className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#4c9c87]" /> Driver decisions notify applicants</div><div className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#4c9c87]" /> Location heartbeats are timestamped</div><div className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-[#4c9c87]" /> Monnify credits require verification</div></CardContent></Card></div><LiveMap drivers={liveDrivers.data ?? []} /></div>;
}

function SupabaseDriverReview() {
  const utils = trpc.useUtils();
  const applications = trpc.operations.supabaseDriverApplications.useQuery(undefined, { refetchInterval: 5000 });
  const approve = trpc.operations.approveSupabaseDriver.useMutation({
    onSuccess: async () => {
      toast.success("Kkar app driver approved");
      await utils.operations.supabaseDriverApplications.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  return <Card className="rounded-[26px] border-[#e0ece8]"><CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle className="text-base text-[#193d3c]">Kkar app driver applications</CardTitle><p className="mt-1 text-xs text-[#89a19d]">Only approved Supabase driver accounts can go online.</p></div><Badge className="bg-[#fff3d7] text-[#a8781d] hover:bg-[#fff3d7]">{applications.data?.length ?? 0} pending</Badge></CardHeader><CardContent className="space-y-3">{applications.isLoading ? <div className="p-5 text-sm text-[#87a09a]">Loading applications…</div> : applications.error ? <div className="rounded-xl bg-[#fff2ef] p-4 text-sm text-[#a85d52]">{applications.error.message}</div> : applications.data?.length ? applications.data.map(application => <div key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2eee9] p-4"><div><div className="text-sm font-extrabold text-[#355754]">{application.profiles?.full_name || "Driver applicant"}</div><div className="mt-1 text-xs text-[#819a95]">{application.vehicle_color} {application.vehicle_make} {application.vehicle_model} · {application.vehicle_type} · {application.plate_number}</div><div className="mt-1 text-[10px] text-[#8ca39e]">{application.profiles?.email || "No email on profile"}</div></div><Button onClick={() => approve.mutate({ driverId: application.id })} disabled={approve.isPending} size="sm" className="rounded-lg bg-[#3f967f] text-white hover:bg-[#347f6c]"><Check className="mr-1.5 h-3.5 w-3.5" /> Approve</Button></div>) : <div className="rounded-2xl border border-dashed border-[#cfe2db] p-8 text-center text-sm text-[#87a09a]">No Kkar app applications waiting for review.</div>}</CardContent></Card>;
}

function DriverReview() {
  const utils = trpc.useUtils();
  const applications = trpc.operations.driverApplications.useQuery();
  const documents = trpc.operations.driverDocuments.useQuery();
  const reviewDriver = trpc.operations.reviewDriver.useMutation({ onSuccess: async () => { toast.success("Driver decision saved"); await Promise.all([utils.operations.driverApplications.invalidate(), utils.operations.driverDocuments.invalidate()]); } });
  const reviewDocument = trpc.operations.reviewDocument.useMutation({ onSuccess: async () => { toast.success("Document decision saved"); await utils.operations.driverDocuments.invalidate(); } });
  return <div className="space-y-6"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Operations / Driver review</div><h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Approve the network.</h1><p className="mt-2 text-sm text-[#7b9490]">Review driver profiles and every uploaded document before they can go online.</p></div><SupabaseDriverReview /><div className="grid gap-6 xl:grid-cols-[1fr_1fr]"><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base text-[#193d3c]">Pending applications</CardTitle><Badge className="bg-[#fff3d7] text-[#a8781d] hover:bg-[#fff3d7]">{applications.data?.length ?? 0} pending</Badge></CardHeader><CardContent className="space-y-3">{applications.data?.length ? applications.data.map(application => <div key={application.id} className="rounded-2xl border border-[#e2eee9] p-4"><div className="flex items-start justify-between"><div><div className="text-sm font-extrabold text-[#355754]">Driver #{application.id}</div><div className="mt-1 text-xs text-[#819a95]">{application.vehicleType} · {application.defaultLga} · {application.plateNumber}</div></div><Badge variant="outline" className="border-[#ecd9a7] text-[#a77a22]">Pending</Badge></div><div className="mt-4 flex gap-2"><Button onClick={() => reviewDriver.mutate({ driverId: application.id, decision: "approved" })} size="sm" className="rounded-lg bg-[#3f967f] text-white hover:bg-[#347f6c]"><Check className="mr-1.5 h-3.5 w-3.5" /> Approve</Button><Button onClick={() => reviewDriver.mutate({ driverId: application.id, decision: "rejected" })} size="sm" variant="outline" className="rounded-lg border-[#edc5bd] text-[#bd7063]"><X className="mr-1.5 h-3.5 w-3.5" /> Reject</Button></div></div>) : <div className="rounded-2xl border border-dashed border-[#cfe2db] p-10 text-center text-sm text-[#87a09a]">No applications waiting for review.</div>}</CardContent></Card><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base text-[#193d3c]">Documents queue</CardTitle><FileCheck2 className="h-5 w-5 text-[#76a49b]" /></CardHeader><CardContent className="space-y-3">{documents.data?.length ? documents.data.map(document => <div key={document.id} className="flex items-center gap-3 rounded-2xl bg-[#f6faf8] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e4f2eb] text-[#408d7b]"><FileCheck2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[#42635e]">{document.documentType.replaceAll("_", " ")}</div><div className="text-[10px] text-[#8ca39e]">Driver #{document.driverId} · <a href={document.url} target="_blank" rel="noreferrer" className="text-[#3f8b79] underline">{document.originalFileName}</a></div></div><div className="flex gap-1.5"><button onClick={() => reviewDocument.mutate({ documentId: document.id, decision: "approved" })} className="rounded-lg bg-[#e4f3eb] px-2.5 py-2 text-[#3d8e7b] hover:bg-[#d5ecdf]"><Check className="h-3.5 w-3.5" /></button><button onClick={() => reviewDocument.mutate({ documentId: document.id, decision: "rejected", rejectionReason: "Please upload a clearer document" })} className="rounded-lg bg-[#fff0ed] px-2.5 py-2 text-[#c4776a] hover:bg-[#ffe3df]"><X className="h-3.5 w-3.5" /></button></div></div>) : <div className="rounded-2xl border border-dashed border-[#cfe2db] p-10 text-center text-sm text-[#87a09a]">No documents waiting for review.</div>}</CardContent></Card></div><BulkDocumentReview /></div>;
}

function Finance() {
  const pricing = trpc.operations.pricing.useQuery();
  const utils = trpc.useUtils();
  const updateShare = trpc.operations.updateRevenueShare.useMutation({ onSuccess: async () => { toast.success("Revenue share updated"); await utils.operations.pricing.invalidate(); } });
  const [commission, setCommission] = useState("20");
  return <div className="space-y-8"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Operations / Finance</div><h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Keep the maths honest.</h1><p className="mt-2 text-sm text-[#7b9490]">Manage global revenue share and per-LGA pricing rules for all vehicle types.</p></div><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader><CardTitle className="text-base text-[#193d3c]">Driver income percentage (global)</CardTitle></CardHeader><CardContent><div className="rounded-2xl bg-[#edf7f2] p-5"><div className="text-[10px] font-black uppercase tracking-[0.13em] text-[#69948b]">Current platform share</div><div className="mt-2 text-4xl font-black tracking-[-0.06em] text-[#2e7568]">{pricing.data?.[0] ? `${(pricing.data[0].commissionBps / 100).toFixed(0)}%` : "20%"}</div><p className="mt-2 text-xs leading-relaxed text-[#78948d]">If platform share is 20%, the driver income share is 80%. This applies as a base across all active pricing rules.</p></div><label className="mt-5 block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">Set platform share (%)</span><Input type="number" min="0" max="100" value={commission} onChange={event => setCommission(event.target.value)} className="h-12 rounded-xl" /></label><Button onClick={() => updateShare.mutate({ commissionBps: Math.round(Number(commission) * 100) })} disabled={updateShare.isPending} className="mt-4 h-12 w-full rounded-xl bg-[#113a3b] text-white">{updateShare.isPending ? "Saving…" : "Save revenue share"}</Button></CardContent></Card><PricingRulesManager /></div>;
}

function Admins() {
  const admins = trpc.operations.admins.useQuery();
  const create = trpc.admin.createUser.useMutation({ onSuccess: async () => { toast.success("Administrator created"); await admins.refetch(); } });
  const [username, setUsername] = useState(""); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<"admin" | "super_admin">("admin"); const [password, setPassword] = useState("");
  return <div className="space-y-6"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Operations / Administrators</div><h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Control access carefully.</h1><p className="mt-2 text-sm text-[#7b9490]">Only a super-admin can create another admin or super-admin. Every new credential must change its temporary password.</p></div><div className="grid gap-6 xl:grid-cols-[1fr_1fr]"><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader><CardTitle className="text-base text-[#193d3c]">Create administrator</CardTitle></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); create.mutate({ username, name, email: email || undefined, role, password }); }} className="space-y-3"><Input value={username} onChange={event => setUsername(event.target.value)} placeholder="Username" className="h-11 rounded-xl" /><Input value={name} onChange={event => setName(event.target.value)} placeholder="Full name" className="h-11 rounded-xl" /><Input value={email} onChange={event => setEmail(event.target.value)} placeholder="Email (optional)" className="h-11 rounded-xl" /><select value={role} onChange={event => setRole(event.target.value as "admin" | "super_admin")} className="h-11 w-full rounded-xl border border-[#dcebe5] bg-white px-3 text-sm"><option value="admin">Admin</option><option value="super_admin">Super-admin</option></select><Input value={password} onChange={event => setPassword(event.target.value)} placeholder="Temporary password (10+ characters)" type="password" className="h-11 rounded-xl" /><Button disabled={create.isPending || password.length < 10} className="h-11 w-full rounded-xl bg-[#113a3b] text-white">{create.isPending ? "Creating…" : "Create credential"}</Button></form></CardContent></Card><Card className="rounded-[26px] border-[#e0ece8]"><CardHeader><CardTitle className="text-base text-[#193d3c]">Current administrators</CardTitle></CardHeader><CardContent className="space-y-2">{admins.data?.length ? admins.data.map(admin => <div key={admin.id} className="flex items-center gap-3 rounded-xl bg-[#f6faf8] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5f2ec] text-[#3c8b78]"><Users className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-bold text-[#42635e]">{admin.name || admin.username}</div><div className="text-[10px] text-[#8aa29d]">@{admin.username} · {admin.role}</div></div>{admin.mustChangePassword && <Badge className="bg-[#fff3d7] text-[#a8781d] hover:bg-[#fff3d7]">Password reset</Badge>}</div>) : <div className="rounded-2xl border border-dashed border-[#cfe2db] p-10 text-center text-sm text-[#87a09a]">No credentials found yet.</div>}</CardContent></Card></div></div>;
}

function Mail() {
  const { data: mail, isLoading, refetch } = trpc.admin.listReceivedMail.useQuery({ page: 0, limit: 20, unreadOnly: false });
  const markAsRead = trpc.admin.markMailAsRead.useMutation({ onSuccess: () => refetch() });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">Admin / Messages</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-[#153b3b]">Your inbox.</h1>
        <p className="mt-2 text-sm text-[#7b9490]">Messages from customer care admins and system notifications.</p>
      </div>
      <Card className="rounded-[26px] border-[#e0ece8]">
        <CardHeader>
          <CardTitle className="text-base text-[#193d3c]">Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-sm text-[#89a19d]">Loading messages...</div>
          ) : !mail?.length ? (
            <div className="rounded-2xl border border-dashed border-[#cfe2db] p-10 text-center text-sm text-[#87a09a]">No messages yet.</div>
          ) : (
            <div className="space-y-2">
              {mail.map(msg => (
                <div key={msg.id} className={`p-4 rounded-xl transition-colors ${msg.readAt ? "bg-[#f6faf8]" : "bg-[#e8f4f0] border border-[#d4e8e2]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#42635e] text-sm">{msg.fromName || msg.fromUsername}</div>
                      <div className="text-xs text-[#7b9490] truncate">{msg.subject}</div>
                      <div className="text-xs text-[#89a19d] mt-1">{new Date(msg.createdAt).toLocaleString()}</div>
                    </div>
                    {!msg.readAt && (
                      <button
                        onClick={() => markAsRead.mutate({ messageId: msg.id })}
                        className="text-xs bg-[#113a3b] text-white px-2 py-1 rounded whitespace-nowrap"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  {expandedId === msg.id && (
                    <div className="mt-3 pt-3 border-t border-[#d4e8e2] text-sm text-[#42635e] leading-relaxed">{msg.messageBody}</div>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                    className="mt-2 text-xs text-[#2f7e70] hover:text-[#1e5555] font-semibold"
                  >
                    {expandedId === msg.id ? "Hide" : "Show"} message
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Admin() {
  const { user, loading, logout } = useAuth();
  const { canInstall, installApp } = usePwaInstall();
  const [section, setSection] = useState<Section>("overview");
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#eef7f3] text-sm text-[#6e8984]">Checking admin session…</div>;
  if (!user || !["admin", "super_admin", "customer_care"].includes(user.role)) return <Login />;
  const canManageReleases = user.role === "admin" || user.role === "super_admin";
  const canManageLaunch = user.role === "admin" || user.role === "super_admin";
  const mobileSections: Section[] = [
    "overview",
    "drivers",
    "finance",
    "messages",
    ...(canManageLaunch ? ["mailbox" as const, "launch" as const] : []),
    ...(canManageReleases ? ["releases" as const] : []),
    ...(user.role === "super_admin" ? ["admins" as const] : []),
  ];
  return (
    <div className="flex min-h-screen bg-[#f5fbf8]">
      {user.mustChangePassword && <InitialAdminSetup username={user.username || ""} onDone={async () => { await logout(); window.location.replace("/admin"); }} />}
      <Sidebar active={section} setActive={setSection} role={user.role} />
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-[#dcebe5] bg-white px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><Mark /></div>
          <div className="hidden text-[11px] font-bold text-[#78918e] lg:block">Kkary / ADMIN / {section.toUpperCase()}</div>
          <div className="flex items-center gap-3">
            {canInstall && <Button size="sm" onClick={installApp} className="rounded-lg bg-[#4ea88e] text-white hover:bg-[#3d9178]"><Download className="mr-2 h-4 w-4" /> Install Console</Button>}
            <div className="hidden items-center gap-2 rounded-full bg-[#eef7f3] px-3 py-2 text-[10px] font-bold text-[#4a7c72] sm:flex"><span className="h-2 w-2 rounded-full bg-[#4ea88e]" /> {user.name || user.username}</div>
            <Button variant="ghost" size="sm" onClick={() => logout()} className="text-xs text-[#78918e]">Sign out</Button>
          </div>
        </header>
        <div className="border-b border-[#e4efeb] bg-white px-5 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {mobileSections.map(item => <button key={item} onClick={() => setSection(item)} className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-bold ${section === item ? "bg-[#113a3b] text-white" : "bg-[#f1f7f4] text-[#78918e]"}`}>{item === "launch" ? "Launch page" : item === "mailbox" ? "Mailbox" : item === "messages" ? "User messages" : item}</button>)}
          </div>
        </div>
        <div className="mx-auto max-w-[1320px] p-5 lg:p-8">
          {section === "overview" ? <Overview />
            : section === "drivers" ? <DriverReview />
              : section === "finance" ? <Finance />
                : section === "messages" ? <Mail />
                  : section === "mailbox" && canManageLaunch ? <AdminMailbox />
                    : section === "launch" && canManageLaunch ? <LaunchPageSettings onOpenMailbox={() => setSection("mailbox")} />
                      : section === "releases" && canManageReleases ? <AppReleases />
                        : section === "admins" && user.role === "super_admin" ? <Admins />
                          : <Overview />}
        </div>
      </main>
    </div>
  );
}
