/// <reference types="@types/google.maps" />

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Globe2,
  Home,
  KeyRound,
  LockKeyhole,
  Mail,
  Map,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { MapView } from "@/components/Map";
import { supabase } from "@/lib/supabase";

type AccountPage = "account" | "profile" | "saved-places" | "settings" | "security" | "language" | "privacy" | "earn";
type SavedPlace = {
  id: string;
  place_type: "home" | "work" | "custom";
  place_name: string;
  address: string;
  latitude: number;
  longitude: number;
};
type PlaceDraft = Omit<SavedPlace, "id"> & { id?: string };
type SavedProfile = { avatar_path: string | null; preferred_language: string };

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-[#12393a] px-4 py-3 text-sm font-black text-white transition hover:bg-[#1c5050] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dfeceb] bg-white px-4 py-3 text-sm font-bold text-[#234d4e] transition hover:bg-[#f5faf8] disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "w-full rounded-2xl border border-[#dfeceb] bg-white px-4 py-3 text-sm text-[#173b3b] outline-none transition focus:border-[#4b9e8a]";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function initialAccountPage(): AccountPage {
  if (typeof window === "undefined") return "account";
  const hash = window.location.hash.startsWith("#account-") ? window.location.hash.slice("#account-".length) : "account";
  const pages: AccountPage[] = ["account", "profile", "saved-places", "settings", "security", "language", "privacy", "earn"];
  return pages.includes(hash as AccountPage) ? hash as AccountPage : "account";
}

function imageDetails(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[26px] border border-[#e3eeeb] bg-white p-5 shadow-[0_12px_34px_rgba(16,53,58,0.05)]">{children}</div>;
}

function ListItem({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof UserRound;
  title: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl px-3 py-4 text-left transition hover:bg-[#f5faf8]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf7f3] text-[#398171]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[#173b3b]">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-[#76918b]">{detail}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#83a19a]" />
    </button>
  );
}

function LocationPicker({
  initialPlace,
  onSave,
  onCancel,
}: {
  initialPlace: PlaceDraft;
  onSave: (place: PlaceDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initialPlace);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>({ lat: 5.03, lng: 7.91 });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapMessage, setMapMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [markerInstance, setMarkerInstance] = useState<google.maps.Marker | null>(null);

  const title = draft.place_type === "home" ? "Home" : draft.place_type === "work" ? "Work" : "Add a place";

  const chooseLocation = async (position: google.maps.LatLngLiteral, address?: string) => {
    setMapMessage("");
    setMapCenter(position);
    if (mapInstance) mapInstance.panTo(position);
    if (markerInstance) markerInstance.setPosition(position);
    try {
      const formatted = address ?? await new Promise<string>((resolve, reject) => {
        if (!window.google?.maps) {
          reject(new Error("Location services are still loading."));
          return;
        }
        new google.maps.Geocoder().geocode({ location: position }, (results, status) => {
          const result = results?.[0];
          if (status === "OK" && result) resolve(result.formatted_address);
          else reject(new Error("We couldn't find an address here. Search for a nearby place instead."));
        });
      });
      setDraft(current => ({ ...current, address: formatted, latitude: position.lat, longitude: position.lng }));
    } catch (cause) {
      setMapMessage(errorText(cause));
    }
  };

  const searchLocation = async () => {
    const query = draft.address.trim();
    if (!query) {
      setMapMessage("Enter a place or address to search.");
      return;
    }
    if (!window.google?.maps) {
      setMapOpen(true);
      setMapMessage("The map is loading. Search again when it has opened.");
      return;
    }
    try {
      const { results } = await new google.maps.Geocoder().geocode({ address: query });
      const result = results[0];
      if (!result) {
        setMapMessage("No matching location was found. Try a nearby landmark or address.");
        return;
      }
      const point = result.geometry.location.toJSON();
      setDraft(current => ({ ...current, address: result.formatted_address, latitude: point.lat, longitude: point.lng }));
      setMapCenter(point);
      if (mapInstance) mapInstance.panTo(point);
      if (markerInstance) markerInstance.setPosition(point);
      setMapMessage("");
    } catch (cause) {
      setMapMessage(errorText(cause));
    }
  };

  const openMap = () => {
    setMapError("");
    setMapReady(false);
    setMapOpen(true);
    if (!navigator.geolocation) {
      setMapMessage("Location access isn't available. You can still search or choose a point manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setMapCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
        setMapMessage("");
      },
      () => setMapMessage("Location permission was not granted. Search for an address or move the map manually."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (!mapOpen) return;
    const timeout = window.setTimeout(() => {
      if (!mapReady) setMapError("The map could not be loaded. You can still search for an address.");
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [mapOpen, mapReady]);

  useEffect(() => {
    if (!mapOpen || !mapInstance) return;
    mapInstance.panTo(mapCenter);
    markerInstance?.setPosition(mapCenter);
  }, [mapCenter, mapInstance, mapOpen, markerInstance]);

  const confirmSave = async () => {
    setError("");
    if (!draft.address.trim() || draft.latitude === 0 && draft.longitude === 0) {
      setError("Search for or select a location on the map before saving.");
      return;
    }
    if (draft.place_type === "custom" && !draft.place_name.trim()) {
      setError("Give this saved place a name.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...draft, place_name: draft.place_type === "custom" ? draft.place_name.trim() : title });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} aria-label="Back to saved places" className="rounded-xl border border-[#dfeceb] bg-white p-2.5 text-[#315b5a]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-xl font-black tracking-[-0.04em] text-[#12393a]">{title}</h2>
          <p className="text-xs text-[#718c86]">Choose an address for your saved places.</p>
        </div>
      </div>
      <SectionCard>
        {draft.place_type === "custom" && (
          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs font-bold text-[#557770]">Place name</span>
            <input className={inputClass} value={draft.place_name} onChange={event => setDraft(current => ({ ...current, place_name: event.target.value }))} placeholder="Gym, School, Church..." maxLength={80} />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-[#557770]">Search location</span>
          <span className="flex gap-2">
            <input
              className={inputClass}
              value={draft.address}
              onChange={event => setDraft(current => ({ ...current, address: event.target.value, latitude: 0, longitude: 0 }))}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void searchLocation(); } }}
              placeholder="Search an address or place"
              autoComplete="street-address"
            />
            <button onClick={() => void searchLocation()} className={secondaryButtonClass} aria-label="Search location"><ArrowRight className="h-4 w-4" /></button>
            <button onClick={openMap} className={secondaryButtonClass} aria-label="Open interactive map"><Map className="h-4 w-4" /></button>
          </span>
        </label>
        {mapMessage && <p role="status" className="mt-3 text-sm text-[#567a73]">{mapMessage}</p>}
        {mapOpen && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfeceb]">
            {mapError ? (
              <div className="p-4 text-sm text-[#9b4e3f]">{mapError}</div>
            ) : (
              <MapView
                className="h-64 w-full"
                initialCenter={mapCenter}
                initialZoom={15}
                onMapReady={map => {
                  setMapInstance(map);
                  setMapReady(true);
                  const marker = new google.maps.Marker({ map, position: mapCenter, draggable: true });
                  setMarkerInstance(marker);
                  map.addListener("click", (event: google.maps.MapMouseEvent) => {
                    if (event.latLng) void chooseLocation(event.latLng.toJSON());
                  });
                  marker.addListener("dragend", () => {
                    const position = marker.getPosition();
                    if (position) void chooseLocation(position.toJSON());
                  });
                  if (draft.latitude !== 0 || draft.longitude !== 0) {
                    const position = { lat: draft.latitude, lng: draft.longitude };
                    map.setCenter(position);
                    marker.setPosition(position);
                  }
                }}
              />
            )}
            <div className="flex items-center justify-between gap-3 bg-[#f5faf8] p-3">
              <p className="text-xs text-[#597872]">{mapReady ? "Tap the map or drag the pin to select a location." : "Loading map..."}</p>
              <button onClick={() => setMapOpen(false)} className="text-xs font-bold text-[#347f70]">Close map</button>
            </div>
          </div>
        )}
        {draft.address && (
          <div className="mt-4 rounded-2xl bg-[#f1f8f5] p-3 text-sm text-[#315b5a]">
            <div className="text-[10px] font-black uppercase tracking-[0.13em] text-[#70988e]">Selected location</div>
            <div className="mt-1 font-semibold">{draft.address}</div>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-[#a94438]">{error}</p>}
        <button onClick={() => void confirmSave()} disabled={saving} className={`${buttonClass} mt-4 w-full`}>
          {saving ? "Saving..." : "Save place"}
        </button>
      </SectionCard>
    </div>
  );
}

export default function RiderAccount({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [page, setPage] = useState<AccountPage>(initialAccountPage);
  const [settings, setSettings] = useState<SavedProfile>({ avatar_path: null, preferred_language: "en" });
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [name, setName] = useState(String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""));
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [language, setLanguage] = useState("en");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [deleteText, setDeleteText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const displayName = name || "Kkar rider";
  const driverUrl = import.meta.env.VITE_KKARY_DRIVER_WEBSITE_URL || "/drivers";
  const resolvedDriverUrl = useMemo(() => new URL(driverUrl, window.location.origin), [driverUrl]);
  const driverUrlIsExternal = resolvedDriverUrl.origin !== window.location.origin;

  useEffect(() => {
    let cancelled = false;
    const loadAccount = async () => {
      setBusy(true);
      setError("");
      try {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("avatar_path, preferred_language")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!data) throw new Error("Your profile is not initialized. Apply the Kkar Supabase account migration and sign in again.");
        const profile = data as SavedProfile;
        if (!cancelled) {
          setSettings(profile);
          setLanguage(profile.preferred_language || "en");
        }
        const { data: places, error: placesError } = await supabase
          .from("saved_places")
          .select("id, place_type, place_name, address, latitude, longitude")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });
        if (placesError) throw placesError;
        if (!cancelled) setSavedPlaces((places ?? []) as SavedPlace[]);
        if (profile.avatar_path) {
          const { data: signed, error: signedError } = await supabase.storage
            .from("account-avatars")
            .createSignedUrl(profile.avatar_path, 3600);
          if (signedError) throw signedError;
          if (!cancelled) setAvatarUrl(signed.signedUrl);
        }
      } catch (cause) {
        if (!cancelled) setError(errorText(cause));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void loadAccount();
    return () => { cancelled = true; };
  }, [user.id]);

  useEffect(() => {
    if (!settings.avatar_path) return;
    let cancelled = false;
    const refreshAvatarUrl = async () => {
      const { data, error: signedUrlError } = await supabase.storage
        .from("account-avatars")
        .createSignedUrl(settings.avatar_path!, 3600);
      if (signedUrlError) {
        if (!cancelled) setError(`Unable to load profile picture. ${errorText(signedUrlError)}`);
        return;
      }
      if (!cancelled) setAvatarUrl(data.signedUrl);
    };
    const timer = window.setInterval(() => void refreshAvatarUrl(), 50 * 60 * 1000);
    window.addEventListener("focus", refreshAvatarUrl);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshAvatarUrl);
    };
  }, [settings.avatar_path]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const historyPage = event.state?.accountPage;
      const hash = window.location.hash.startsWith("#account-") ? window.location.hash.slice("#account-".length) : "account";
      const selected = typeof historyPage === "string" ? historyPage : hash;
      const validPages: AccountPage[] = ["account", "profile", "saved-places", "settings", "security", "language", "privacy", "earn"];
      setPage(validPages.includes(selected as AccountPage) ? selected as AccountPage : "account");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const clearFeedback = () => { setError(""); setMessage(""); };
  const goTo = (next: AccountPage) => {
    clearFeedback();
    setPage(next);
    setPlaceDraft(null);
    window.history.pushState({ accountPage: next }, "", next === "account" ? "#account" : `#account-${next}`);
  };
  const goBack = (fallback: AccountPage) => {
    clearFeedback();
    if (window.history.state?.accountPage === page) {
      window.history.back();
      return;
    }
    setPage(fallback);
  };

  const saveName = async () => {
    clearFeedback();
    if (name.trim().length < 2) {
      setError("Enter a name with at least two characters.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, full_name: name.trim(), name: name.trim() },
      });
      if (updateError) throw updateError;
      setMessage("Profile updated successfully");
    } catch (cause) {
      setError(`Unable to update profile. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const selectAvatar = async (file?: File) => {
    clearFeedback();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }
    setBusy(true);
    let candidatePreview = "";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const details = imageDetails(bytes);
      if (!details) throw new Error("Use a valid JPEG, PNG, or WebP image.");
      const verifiedImage = await createImageBitmap(new Blob([bytes], { type: details.mime }));
      if (verifiedImage.width < 1 || verifiedImage.height < 1 || verifiedImage.width > 10000 || verifiedImage.height > 10000) {
        verifiedImage.close();
        throw new Error("The image dimensions are not supported.");
      }
      verifiedImage.close();
      candidatePreview = URL.createObjectURL(new Blob([bytes], { type: details.mime }));
      setAvatarPreview(candidatePreview);
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!authData.session?.access_token) throw new Error("Sign in again to upload your profile picture.");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        const chunk = bytes.subarray(offset, offset + 0x8000);
        for (let index = 0; index < chunk.length; index += 1) {
          binary += String.fromCharCode(chunk[index]);
        }
      }
      const uploadResponse = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: authData.session.access_token, imageBase64: btoa(binary) }),
      });
      const uploadResult = await uploadResponse.json() as { path?: string; error?: string };
      if (!uploadResponse.ok || !uploadResult.path) {
        throw new Error(uploadResult.error ?? "The profile picture could not be uploaded.");
      }
      const path = uploadResult.path;
      const { data: signed, error: signedError } = await supabase.storage.from("account-avatars").createSignedUrl(path, 3600);
      if (signedError) {
        await supabase.storage.from("account-avatars").remove([path]);
        throw signedError;
      }
      const previousPath = settings.avatar_path;
      const { error: saveError } = await supabase.from("profiles").update({ avatar_path: path }).eq("auth_user_id", user.id).select("auth_user_id").single();
      if (saveError) {
        await supabase.storage.from("account-avatars").remove([path]);
        throw saveError;
      }
      setSettings(current => ({ ...current, avatar_path: path }));
      setAvatarUrl(signed.signedUrl);
      setAvatarPreview("");
      URL.revokeObjectURL(candidatePreview);
      if (previousPath) {
        const { error: cleanupError } = await supabase.storage.from("account-avatars").remove([previousPath]);
        setMessage(cleanupError
          ? "Profile picture updated successfully. The previous private image could not be removed."
          : "Profile picture updated successfully");
      } else {
        setMessage("Profile picture updated successfully");
      }
    } catch (cause) {
      if (candidatePreview) {
        URL.revokeObjectURL(candidatePreview);
        setAvatarPreview("");
      }
      setError(`Unable to upload profile picture. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = async () => {
    clearFeedback();
    if (!settings.avatar_path) return;
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from("profiles").update({ avatar_path: null }).eq("auth_user_id", user.id).select("auth_user_id").single();
      if (updateError) throw updateError;
      setSettings(current => ({ ...current, avatar_path: null }));
      setAvatarUrl("");
      setAvatarPreview("");
      setMessage("Profile picture removed");
      const { error: storageCleanupError } = await supabase.storage.from("account-avatars").remove([settings.avatar_path]);
      if (storageCleanupError) setMessage("Profile picture removed from your profile, but private storage cleanup could not complete.");
    } catch (cause) {
      setError(`Unable to remove profile picture. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const requestEmailChange = async () => {
    clearFeedback();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
      if (updateError) throw updateError;
      setEditingEmail(false);
      setMessage("Check your new email inbox and confirm the verification link before the address is changed.");
    } catch (cause) {
      setError(`Unable to start email change. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const requestPhoneChange = async () => {
    clearFeedback();
    if (!phone.trim()) {
      setError("Enter the new phone number, including its country code.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ phone: phone.trim() });
      if (updateError) throw updateError;
      setPendingPhone(phone.trim());
      setMessage("A verification code was sent to the new phone number.");
    } catch (cause) {
      setError(`Unable to start phone change. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const verifyPhoneChange = async () => {
    clearFeedback();
    if (!/^\d{6,8}$/.test(phoneOtp.trim())) {
      setError("Enter the verification code sent to your new phone.");
      return;
    }
    setBusy(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: pendingPhone,
        token: phoneOtp.trim(),
        type: "phone_change",
      });
      if (verifyError) throw verifyError;
      const { data: refreshed, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      setPhone(refreshed.user.phone ?? pendingPhone);
      setPendingPhone("");
      setPhoneOtp("");
      setEditingPhone(false);
      setMessage("Phone number updated successfully");
    } catch (cause) {
      setError(`Unable to verify phone number. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const savePlace = async (place: PlaceDraft) => {
    const values = {
      place_type: place.place_type,
      place_name: place.place_name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
    };
    const { data, error: saveError } = place.id
      ? await supabase.from("saved_places").update(values).eq("id", place.id).eq("user_id", user.id).select("id, place_type, place_name, address, latitude, longitude").single()
      : await supabase.from("saved_places").upsert({
          ...values,
          user_id: user.id,
        }, { onConflict: "user_id,place_name" }).select("id, place_type, place_name, address, latitude, longitude").single();
    if (saveError) throw saveError;
    setSavedPlaces(current => [...current.filter(item => item.id !== place.id && item.place_name !== data.place_name), data as SavedPlace]);
    setPlaceDraft(null);
    setMessage(`${data.place_name} saved`);
  };

  const removePlace = async (place: SavedPlace) => {
    clearFeedback();
    setBusy(true);
    try {
      const { error: removeError } = await supabase.from("saved_places").delete().eq("id", place.id).eq("user_id", user.id);
      if (removeError) throw removeError;
      setSavedPlaces(current => current.filter(item => item.id !== place.id));
      setMessage(`${place.place_name} removed`);
    } catch (cause) {
      setError(`Unable to remove saved place. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const saveLanguage = async (next: string) => {
    clearFeedback();
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from("profiles").update({ preferred_language: next }).eq("auth_user_id", user.id).select("auth_user_id").single();
      if (updateError) throw updateError;
      setLanguage(next);
      setSettings(current => ({ ...current, preferred_language: next }));
      setMessage("Language preference saved");
    } catch (cause) {
      setError(`Unable to save language preference. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    clearFeedback();
    if (!passwords.current || passwords.next.length < 8 || passwords.next !== passwords.confirm) {
      setError("Enter your current password, a new password of at least 8 characters, and matching confirmation.");
      return;
    }
    const identifier = user.email ? { email: user.email } : user.phone ? { phone: user.phone } : null;
    if (!identifier) {
      setError("Kkar cannot verify this account with the current sign-in method. Use account recovery to change the password.");
      return;
    }
    setBusy(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ ...identifier, password: passwords.current });
      if (reauthError) throw new Error("The current password could not be verified.");
      const { error: passwordError } = await supabase.auth.updateUser({ password: passwords.next });
      if (passwordError) throw passwordError;
      setPasswords({ current: "", next: "", confirm: "" });
      setMessage("Account password updated successfully");
    } catch (cause) {
      setError(`Unable to update account password. ${errorText(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    clearFeedback();
    if (deleteText !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }
    setBusy(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!authData.session?.access_token) throw new Error("Sign in again to delete your account.");
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: authData.session.access_token }),
      });
      const result = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error ?? "Your account could not be deleted.");
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      onSignedOut();
    } catch (cause) {
      setError(`Unable to delete account. ${errorText(cause)}`);
      setBusy(false);
    }
  };

  const logOut = async () => {
    clearFeedback();
    setBusy(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      onSignedOut();
    } catch (cause) {
      setError(`Unable to log out. ${errorText(cause)}`);
      setBusy(false);
    }
  };

  const openPlaceEditor = (type: SavedPlace["place_type"]) => {
    const current = type === "custom" ? undefined : savedPlaces.find(place => place.place_type === type);
    setPlaceDraft(current ? { ...current } : {
      place_type: type,
      place_name: type === "home" ? "Home" : type === "work" ? "Work" : "",
      address: "",
      latitude: 0,
      longitude: 0,
    });
  };

  const heading = page === "account" ? "Account"
    : page === "saved-places" ? "Saved places"
      : page === "security" ? "Sign in & security"
        : page === "language" ? "Language"
          : page === "privacy" ? "Privacy"
            : page === "earn" ? "Earn with Kkar"
              : page === "profile" ? "Profile"
                : "Settings";

  return (
    <main className="space-y-4 px-4 pb-6 pt-3" aria-labelledby="account-heading">
      <div className="flex items-center gap-3">
        {page !== "account" && (
          <button onClick={() => goBack(page === "profile" || page === "saved-places" || page === "settings" || page === "earn" ? "account" : "settings")} aria-label="Back" className="rounded-xl border border-[#dfeceb] bg-white p-2.5 text-[#315b5a]">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 id="account-heading" className="text-2xl font-black tracking-[-0.06em] text-[#12393a]">{heading}</h1>
          {page === "account" && <p className="mt-0.5 text-sm text-[#728e88]">{displayName}</p>}
        </div>
      </div>

      {(error || message) && (
        <div role={error ? "alert" : "status"} className={`rounded-2xl px-4 py-3 text-sm ${error ? "border border-red-200 bg-red-50 text-red-800" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {error || message}
        </div>
      )}

      {busy && <div className="sr-only" role="status">Saving account changes</div>}

      {page === "account" && (
        <>
          <SectionCard>
            <div className="divide-y divide-[#edf3f1]">
              <ListItem icon={UserRound} title="Profile" detail="Personal information and profile picture" onClick={() => goTo("profile")} />
              <ListItem icon={MapPin} title="Saved places" detail="Home, work, and your favorite places" onClick={() => goTo("saved-places")} />
              <ListItem icon={LockKeyhole} title="Settings" detail="Security, language, and privacy" onClick={() => goTo("settings")} />
            </div>
          </SectionCard>
          <SectionCard>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff3d5] text-[#a97512]"><BriefcaseBusiness className="h-5 w-5" /></span>
              <div>
                <h2 className="font-black text-[#173b3b]">Earn with Kkar</h2>
                <p className="mt-0.5 text-xs text-[#76918b]">Become a driver</p>
              </div>
              <button onClick={() => goTo("earn")} className="ml-auto rounded-xl bg-[#f4b942] p-2.5 text-[#12393a]" aria-label="Earn with Kkar"><ArrowRight className="h-4 w-4" /></button>
            </div>
          </SectionCard>
          <button onClick={() => { clearFeedback(); setLogoutOpen(true); }} className="w-full rounded-2xl border border-[#eed7d3] bg-white px-4 py-3.5 text-sm font-black text-[#a7473d]">
            Log out
          </button>
        </>
      )}

      {page === "profile" && (
        <div className="space-y-4">
          <SectionCard>
            <div className="flex flex-col items-center">
              <div className="relative">
                {avatarPreview || avatarUrl
                  ? <img src={avatarPreview || avatarUrl} alt="Your profile" className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-lg" />
                  : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#e9f5f0] text-[#3b8172]"><UserRound className="h-10 w-10" /></div>}
                <label className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#f4b942] text-[#12393a]" aria-label="Upload profile picture">
                  <Camera className="h-4 w-4" />
                  <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { void selectAvatar(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                </label>
              </div>
              <p className="mt-3 text-xs text-[#718c86]">JPEG, PNG, or WebP · Up to 5 MB</p>
              {settings.avatar_path && <button disabled={busy} onClick={() => void removeAvatar()} className="mt-2 text-xs font-bold text-[#a7473d]">Remove profile picture</button>}
            </div>
          </SectionCard>
          <SectionCard>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#557770]">Name</span>
                <input className={inputClass} value={name} onChange={event => setName(event.target.value)} maxLength={120} autoComplete="name" />
              </label>
              <button disabled={busy} onClick={() => void saveName()} className={`${buttonClass} w-full`}>{busy ? "Saving..." : "Save name"}</button>
              <div className="border-t border-[#edf3f1] pt-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#72938b]"><Mail className="h-4 w-4" /> Email address</div>
                {editingEmail ? (
                  <div className="mt-3 space-y-2">
                    <input className={inputClass} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" />
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => void requestEmailChange()} className={`${buttonClass} flex-1`}>Send verification</button>
                      <button onClick={() => { setEditingEmail(false); setEmail(user.email ?? ""); }} className={secondaryButtonClass}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="break-all text-sm font-semibold text-[#173b3b]">{user.email || "No email on this account"}</span>
                    <button onClick={() => { clearFeedback(); setEditingEmail(true); setEmail(user.email ?? ""); }} className="shrink-0 text-xs font-black text-[#347f70]">Change</button>
                  </div>
                )}
              </div>
              <div className="border-t border-[#edf3f1] pt-4">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#72938b]"><Phone className="h-4 w-4" /> Phone number</div>
                {editingPhone ? (
                  <div className="mt-3 space-y-2">
                    <input className={inputClass} type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+234..." autoComplete="tel" />
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => void requestPhoneChange()} className={`${buttonClass} flex-1`}>Send verification</button>
                      <button onClick={() => { setEditingPhone(false); setPendingPhone(""); setPhone(user.phone ?? ""); }} className={secondaryButtonClass}>Cancel</button>
                    </div>
                    {pendingPhone && (
                      <div className="flex gap-2">
                        <input className={inputClass} value={phoneOtp} onChange={event => setPhoneOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="Verification code" />
                        <button disabled={busy} onClick={() => void verifyPhoneChange()} className={buttonClass}>Verify</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[#173b3b]">{user.phone || "No phone number on this account"}</span>
                    <button onClick={() => { clearFeedback(); setEditingPhone(true); setPhone(user.phone ?? ""); }} className="shrink-0 text-xs font-black text-[#347f70]">Change</button>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {page === "saved-places" && (
        placeDraft ? (
          <LocationPicker initialPlace={placeDraft} onCancel={() => setPlaceDraft(null)} onSave={savePlace} />
        ) : (
          <div className="space-y-4">
            <SectionCard>
              {(["home", "work"] as const).map(type => {
                const Icon = type === "home" ? Home : BriefcaseBusiness;
                const saved = savedPlaces.find(place => place.place_type === type);
                return (
                  <div key={type} className="flex items-center gap-3 border-b border-[#edf3f1] py-3 last:border-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf7f3] text-[#398171]"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black capitalize text-[#173b3b]">{type}</div>
                      <div className="truncate text-xs text-[#76918b]">{saved?.address ?? `Add ${type.toLowerCase()} address`}</div>
                    </div>
                    <button onClick={() => openPlaceEditor(type)} className="rounded-xl border border-[#dfeceb] px-3 py-2 text-xs font-bold text-[#347f70]">{saved ? "Edit" : "Add"}</button>
                  </div>
                );
              })}
            </SectionCard>
            <button onClick={() => openPlaceEditor("custom")} className={`${secondaryButtonClass} w-full`}>
              <Plus className="h-4 w-4" /> Add a place
            </button>
            {savedPlaces.filter(place => place.place_type === "custom").map(place => (
              <SectionCard key={place.id}>
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 shrink-0 text-[#398171]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-[#173b3b]">{place.place_name}</div>
                    <div className="truncate text-xs text-[#76918b]">{place.address}</div>
                  </div>
                  <button onClick={() => setPlaceDraft({ ...place })} className="text-xs font-bold text-[#347f70]">Edit</button>
                  <button disabled={busy} onClick={() => void removePlace(place)} aria-label={`Remove ${place.place_name}`} className="rounded-lg p-2 text-[#a7473d]"><Trash2 className="h-4 w-4" /></button>
                </div>
              </SectionCard>
            ))}
            {!savedPlaces.length && <p className="rounded-2xl bg-white p-5 text-center text-sm text-[#76918b]">Your saved places will appear here.</p>}
          </div>
        )
      )}

      {page === "settings" && (
        <SectionCard>
          <div className="divide-y divide-[#edf3f1]">
            <ListItem icon={ShieldCheck} title="Sign in & security" detail="Passkeys and account password" onClick={() => goTo("security")} />
            <ListItem icon={Globe2} title="Language" detail="English" onClick={() => goTo("language")} />
            <ListItem icon={LockKeyhole} title="Privacy" detail="Privacy information and account deletion" onClick={() => goTo("privacy")} />
          </div>
          <button onClick={() => { clearFeedback(); setLogoutOpen(true); }} className="mt-3 w-full rounded-2xl border border-[#eed7d3] px-4 py-3 text-sm font-black text-[#a7473d]">Log out</button>
        </SectionCard>
      )}

      {page === "security" && (
        <div className="space-y-4">
          <SectionCard>
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 text-[#398171]" />
              <div>
                <h2 className="font-black text-[#173b3b]">Passkeys</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#718c86]">Passkey registration and sign-in aren't available in Kkar's current authentication service. No passkey has been created or stored.</p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#fff3d5] px-3 py-1 text-xs font-bold text-[#8a641e]"><CircleHelp className="h-3.5 w-3.5" /> Not set up</span>
              </div>
            </div>
          </SectionCard>
          <SectionCard>
            <div className="mb-4 flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-[#398171]" /><h2 className="font-black text-[#173b3b]">Account password</h2></div>
            <div className="space-y-3">
              <input className={inputClass} type="password" autoComplete="current-password" value={passwords.current} onChange={event => setPasswords(current => ({ ...current, current: event.target.value }))} placeholder="Current password" />
              <input className={inputClass} type="password" autoComplete="new-password" value={passwords.next} onChange={event => setPasswords(current => ({ ...current, next: event.target.value }))} placeholder="New password (8 characters minimum)" />
              <input className={inputClass} type="password" autoComplete="new-password" value={passwords.confirm} onChange={event => setPasswords(current => ({ ...current, confirm: event.target.value }))} placeholder="Confirm new password" />
              <button disabled={busy} onClick={() => void changePassword()} className={`${buttonClass} w-full`}>{busy ? "Updating..." : "Update password"}</button>
            </div>
          </SectionCard>
        </div>
      )}

      {page === "language" && (
        <SectionCard>
          <label className="block">
            <span className="mb-2 block text-sm font-black text-[#173b3b]">App language</span>
            <select className={inputClass} value={language} disabled={busy} onChange={event => void saveLanguage(event.target.value)}>
              <option value="en">English</option>
            </select>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-[#718c86]">English is currently Kkar's only available interface language. Your preference is saved to your account.</p>
        </SectionCard>
      )}

      {page === "privacy" && (
        <div className="space-y-4">
          <SectionCard>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[#398171]" />
              <div>
                <h2 className="font-black text-[#173b3b]">Your account privacy</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#718c86]">Your profile picture is stored privately. It is visible to you and can be accessed by an assigned driver only while that driver is handling your active pickup. Saved places are available only to your account.</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard>
            <h2 className="font-black text-[#a7473d]">Delete account</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#718c86]">This permanently removes your Kkar sign-in and account settings, saved places, and profile picture. Completed ride records may be retained where needed for legal, safety, or operational obligations. You cannot undo this action. Active rides must be completed or cancelled first.</p>
            {!deleteOpen ? (
              <button onClick={() => { clearFeedback(); setDeleteOpen(true); }} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-[#e8c8c3] px-4 py-3 text-sm font-black text-[#a7473d]"><Trash2 className="h-4 w-4" /> Delete account</button>
            ) : (
              <div className="mt-4 space-y-3 rounded-2xl border border-[#eed7d3] bg-[#fff8f7] p-4">
                <p className="text-sm font-bold text-[#793b35]">To confirm permanent deletion, type DELETE below.</p>
                <input className={inputClass} value={deleteText} onChange={event => setDeleteText(event.target.value)} autoComplete="off" />
                <div className="flex gap-2">
                  <button disabled={busy || deleteText !== "DELETE"} onClick={() => void deleteAccount()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#a7473d] px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Deleting..." : "Permanently delete"}</button>
                  <button onClick={() => { setDeleteOpen(false); setDeleteText(""); }} className={secondaryButtonClass}><X className="h-4 w-4" /> Cancel</button>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {page === "earn" && (
        <SectionCard>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff3d5] text-[#a97512]"><BriefcaseBusiness className="h-7 w-7" /></div>
          <h2 className="mt-5 text-2xl font-black tracking-[-0.05em] text-[#12393a]">Earn with Kkar</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#718c86]">Earn according to your own schedule with weekly payouts.</p>
          <a
            href={resolvedDriverUrl.toString()}
            target={driverUrlIsExternal ? "_blank" : undefined}
            rel={driverUrlIsExternal ? "noopener noreferrer" : undefined}
            className={`${buttonClass} mt-6 w-full`}
          >
            Become a Kkar driver <ArrowRight className="h-4 w-4" />
          </a>
        </SectionCard>
      )}

      {logoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1f22]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="logout-title" className="text-lg font-black text-[#12393a]">Log out of Kkar?</h2>
                <p className="mt-2 text-sm text-[#718c86]">You will need to sign in again to use your account.</p>
              </div>
              <button aria-label="Close confirmation" onClick={() => setLogoutOpen(false)} className="rounded-lg p-1 text-[#718c86]"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 flex gap-2">
              <button disabled={busy} onClick={() => void logOut()} className={`${buttonClass} flex-1`}>{busy ? "Logging out..." : "Log out"}</button>
              <button onClick={() => setLogoutOpen(false)} className={secondaryButtonClass}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {busy && page === "account" && <Check className="sr-only" aria-hidden="true" />}
    </main>
  );
}
