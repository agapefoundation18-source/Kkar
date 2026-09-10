import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Edit, Plus, Save, Trash2, X } from "lucide-react";

const money = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;

export function PricingRulesManager() {
  const utils = trpc.useUtils();
  const allRules = trpc.operations.allPricingRules.useQuery();
  const updateRule = trpc.operations.updatePricingRule.useMutation({
    onSuccess: async () => {
      toast.success("Pricing rule updated");
      await utils.operations.allPricingRules.invalidate();
    },
  });
  const addRule = trpc.operations.updatePricing.useMutation({
    onSuccess: async () => {
      toast.success("Pricing rule added");
      await utils.operations.allPricingRules.invalidate();
      setShowAddForm(false);
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<
    Record<number, { base: string; perKm: string; minimum: string; commission: string; active: boolean }>
  >({});
  const [newRuleForm, setNewRuleForm] = useState({
    lga: "Uyo",
    vehicleType: "bike" as "bike" | "car",
    base: "400",
    perKm: "180",
    minimum: "700",
    commission: "20",
  });

  // Fetch LGAs
  const lgas = trpc.shared.lgas.useQuery();

  const handleEditStart = (rule: any) => {
    setEditingId(rule.id);
    setEditValues({
      [rule.id]: {
        base: (rule.baseFareKobo / 100).toString(),
        perKm: (rule.perKmKobo / 100).toString(),
        minimum: (rule.minimumFareKobo / 100).toString(),
        commission: (rule.commissionBps / 100).toString(),
        active: rule.active,
      },
    });
  };

  const handleSave = (ruleId: number) => {
    const values = editValues[ruleId];
    if (!values) return;
    updateRule.mutate({
      ruleId,
      baseFareKobo: Math.round(Number(values.base) * 100),
      perKmKobo: Math.round(Number(values.perKm) * 100),
      minimumFareKobo: Math.round(Number(values.minimum) * 100),
      commissionBps: Math.round(Number(values.commission) * 100),
      active: values.active,
    });
    setEditingId(null);
  };

  const handleAddRule = () => {
    addRule.mutate({
      serviceArea: newRuleForm.lga,
      vehicleType: newRuleForm.vehicleType,
      baseFareKobo: Math.round(Number(newRuleForm.base) * 100),
      perKmKobo: Math.round(Number(newRuleForm.perKm) * 100),
      minimumFareKobo: Math.round(Number(newRuleForm.minimum) * 100),
      commissionBps: Math.round(Number(newRuleForm.commission) * 100),
    });
  };

  const rules = allRules.data || [];
  const groupedRules = rules.reduce(
    (acc, rule) => {
      const key = `${rule.serviceArea}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(rule);
      return acc;
    },
    {} as Record<string, any[]>
  );

  const displayRules = selectedLga ? groupedRules[selectedLga] || [] : [];
  const visibleGroups = selectedLga
    ? Object.entries(groupedRules).filter(([lga]) => lga === selectedLga)
    : Object.entries(groupedRules);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#63938a]">
            Operations / Pricing Rules
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-[#153b3b]">
            Manage pricing by L.G.A.
          </h2>
          <p className="mt-2 text-sm text-[#7b9490]">
            Select an L.G.A. and configure vehicle types with different base fares, per-km rates, and commissions.
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-xl bg-[#113a3b] text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Rule
        </Button>
      </div>

      {/* LGA Selection Filter */}
      {Object.keys(groupedRules).length > 0 && (
        <Card className="rounded-[26px] border-[#e0ece8] bg-[#f9fdfb]">
          <CardContent className="pt-6">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  Select L.G.A. to manage vehicle pricing
                </label>
                <select
                  value={selectedLga || ""}
                  onChange={(e) => setSelectedLga(e.target.value || null)}
                  className="h-11 w-full rounded-xl border border-[#dcebe5] bg-white px-3 text-sm font-bold text-[#153b3b]"
                >
                  <option value="">All L.G.A.s</option>
                  {Object.keys(groupedRules)
                    .sort()
                    .map((lga) => (
                      <option key={lga} value={lga}>
                        {lga} ({groupedRules[lga].length} vehicle type{groupedRules[lga].length !== 1 ? "s" : ""})
                      </option>
                    ))}
                </select>
              </div>
              {selectedLga && (
                <div className="text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                    Vehicle Types
                  </div>
                  <div className="mt-2 flex gap-2">
                    {displayRules.map((rule) => (
                      <Badge
                        key={rule.id}
                        className={`${rule.active ? "bg-[#e6f5ee] text-[#3a8c78]" : "bg-[#ffe4e1] text-[#cd5c5c]"}`}
                      >
                        {rule.vehicleType === "bike" ? "🏍️" : "🚗"} {rule.vehicleType.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showAddForm && (
        <Card className="rounded-[26px] border-[#e0ece8] bg-[#f9fdfb]">
          <CardHeader>
            <CardTitle className="text-base text-[#193d3c]">Create New Pricing Rule</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddRule();
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  L.G.A.
                </label>
                <select
                  value={newRuleForm.lga}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, lga: e.target.value })}
                  className="h-11 w-full rounded-xl border border-[#dcebe5] px-3 text-sm"
                >
                  {lgas.data?.map((lga) => (
                    <option key={lga} value={lga}>
                      {lga}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  Vehicle Type
                </label>
                <select
                  value={newRuleForm.vehicleType}
                  onChange={(e) =>
                    setNewRuleForm({
                      ...newRuleForm,
                      vehicleType: e.target.value as "bike" | "car",
                    })
                  }
                  className="h-11 w-full rounded-xl border border-[#dcebe5] px-3 text-sm"
                >
                  <option value="bike">Bike</option>
                  <option value="car">Car</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  Base Fare (₦)
                </label>
                <Input
                  type="number"
                  value={newRuleForm.base}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, base: e.target.value })}
                  className="h-11 rounded-xl"
                  min="0"
                  step="10"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  Per KM (₦)
                </label>
                <Input
                  type="number"
                  value={newRuleForm.perKm}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, perKm: e.target.value })}
                  className="h-11 rounded-xl"
                  min="0"
                  step="10"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  Minimum Fare (₦)
                </label>
                <Input
                  type="number"
                  value={newRuleForm.minimum}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, minimum: e.target.value })}
                  className="h-11 rounded-xl"
                  min="0"
                  step="10"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.13em] text-[#809a94]">
                  Commission (%)
                </label>
                <Input
                  type="number"
                  value={newRuleForm.commission}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, commission: e.target.value })}
                  className="h-11 rounded-xl"
                  min="0"
                  max="100"
                  step="1"
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  type="submit"
                  disabled={addRule.isPending}
                  className="flex-1 rounded-xl bg-[#113a3b] text-white"
                >
                  {addRule.isPending ? "Creating..." : "Create Rule"}
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  variant="outline"
                  className="rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {visibleGroups.map(([lga, lgaRules]) => (
        <Card key={lga} className="rounded-[26px] border-[#e0ece8]">
          <CardHeader>
            <CardTitle className="text-base text-[#193d3c]">{lga}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lgaRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 rounded-xl border border-[#e2eee9] bg-[#f9fdfb] p-4"
                >
                  {editingId === rule.id ? (
                    <>
                      <div className="flex-1 grid gap-3 grid-cols-5">
                        <div>
                          <span className="text-[9px] font-bold uppercase text-[#89a19d]">
                            Vehicle
                          </span>
                          <div className="mt-1 text-sm font-bold text-[#356660]">
                            {rule.vehicleType}
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[#89a19d]">
                            Base
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={editValues[rule.id]?.base || ""}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                [rule.id]: { ...editValues[rule.id], base: e.target.value },
                              })
                            }
                            className="mt-1 h-9 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[#89a19d]">
                            /KM
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={editValues[rule.id]?.perKm || ""}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                [rule.id]: { ...editValues[rule.id], perKm: e.target.value },
                              })
                            }
                            className="mt-1 h-9 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[#89a19d]">
                            Min
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={editValues[rule.id]?.minimum || ""}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                [rule.id]: { ...editValues[rule.id], minimum: e.target.value },
                              })
                            }
                            className="mt-1 h-9 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold uppercase text-[#89a19d]">
                            Commission
                          </label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={editValues[rule.id]?.commission || ""}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                [rule.id]: { ...editValues[rule.id], commission: e.target.value },
                              })
                            }
                            className="mt-1 h-9 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSave(rule.id)}
                        disabled={updateRule.isPending}
                        className="rounded-lg bg-[#3f967f] text-white"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setEditingId(null)}
                        variant="outline"
                        className="rounded-lg"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold text-[#356660]">
                            {rule.vehicleType.toUpperCase()}
                          </div>
                          <Badge
                            className={`${rule.active ? "bg-[#e6f5ee] text-[#3a8c78]" : "bg-[#ffe4e1] text-[#cd5c5c]"} hover:bg-transparent`}
                          >
                            {rule.active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="mt-1 grid grid-cols-4 gap-4 text-xs text-[#7b9490]">
                          <div>
                            <span className="block font-bold">Base: {money(rule.baseFareKobo)}</span>
                          </div>
                          <div>
                            <span className="block font-bold">/KM: {money(rule.perKmKobo)}</span>
                          </div>
                          <div>
                            <span className="block font-bold">Min: {money(rule.minimumFareKobo)}</span>
                          </div>
                          <div>
                            <span className="block font-bold">Commission: {(rule.commissionBps / 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleEditStart(rule)}
                        variant="outline"
                        className="rounded-lg"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {!allRules.isLoading && rules.length === 0 && (
        <Card className="rounded-[26px] border-dashed border-[#cfe2db]">
          <CardContent className="p-10 text-center">
            <p className="text-sm text-[#87a09a]">
              No pricing rules yet. Create your first one to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
