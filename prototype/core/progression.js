(function initEchoProgression(root) {
  const UPGRADES = Object.freeze([
    {
      id: "inkwell",
      name: "深墨池",
      icon: "✒",
      maxLevel: 3,
      costs: [6, 12, 20],
      detail: "每级让新一轮的原墨上限提高 2 点。"
    },
    {
      id: "lexicon",
      name: "活页词库",
      icon: "▤",
      maxLevel: 2,
      costs: [10, 22],
      detail: "每级增加 1 个临时词库槽位。"
    },
    {
      id: "grounding",
      name: "定句锚",
      icon: "◇",
      maxLevel: 3,
      costs: [8, 16, 26],
      detail: "每级使远征中的语义威胁增长降低 10%。"
    }
  ]);

  const MODIFIERS = Object.freeze([
    {
      id: "noise",
      name: "高噪回声",
      icon: "≈",
      detail: "语义威胁增长提高 35%。"
    },
    {
      id: "scarcity",
      name: "原墨枯潮",
      icon: "◒",
      detail: "本轮原墨上限降低 2 点。"
    },
    {
      id: "rewriteTax",
      name: "重写税",
      icon: "✦",
      detail: "每次注入额外消耗 1 点原墨。"
    },
    {
      id: "unstableRecovery",
      name: "不稳回流",
      icon: "↯",
      detail: "进入新区域时只降低少量语义威胁。"
    }
  ]);

  function integer(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
  }

  function normalizeLevels(levels = {}) {
    return Object.fromEntries(UPGRADES.map((upgrade) => [
      upgrade.id,
      Math.min(upgrade.maxLevel, integer(levels?.[upgrade.id]))
    ]));
  }

  function createProfile(raw = {}) {
    return {
      schema: 1,
      echo: integer(raw.echo),
      completedRuns: integer(raw.completedRuns),
      expeditionWins: integer(raw.expeditionWins),
      bestScore: integer(raw.bestScore),
      highestCycle: integer(raw.highestCycle),
      totalCollapses: integer(raw.totalCollapses),
      upgrades: normalizeLevels(raw.upgrades),
      achievements: Array.isArray(raw.achievements) ? [...new Set(raw.achievements)] : []
    };
  }

  function modifierIdsForCycle(cycle) {
    const safeCycle = Math.max(1, integer(cycle, 1));
    const primaryIndex = (safeCycle - 1) % MODIFIERS.length;
    const primary = MODIFIERS[primaryIndex].id;
    if (safeCycle < 4) return [primary];
    const offset = 1 + Math.floor((safeCycle - 4) / MODIFIERS.length) % (MODIFIERS.length - 1);
    const secondary = MODIFIERS[(primaryIndex + offset) % MODIFIERS.length].id;
    return [primary, secondary];
  }

  function createRun(profile, mode = "guided", restored = null) {
    const expedition = mode === "expedition";
    const cycle = expedition ? Math.max(1, integer(restored?.cycle, profile.expeditionWins + 1)) : 0;
    const failed = Boolean(expedition && restored?.failed);
    const restoredModifiers = Array.isArray(restored?.modifiers)
      ? [...new Set(restored.modifiers.filter((id) => MODIFIERS.some((item) => item.id === id)))]
      : [];
    return {
      cycle,
      threat: failed ? 100 : expedition ? Math.min(99, integer(restored?.threat)) : 0,
      integrity: failed ? 0 : expedition ? Math.max(1, Math.min(3, integer(restored?.integrity, 3))) : 3,
      collapses: expedition ? integer(restored?.collapses) : 0,
      failed,
      rewardClaimed: Boolean(restored?.rewardClaimed),
      lastReward: integer(restored?.lastReward),
      modifiers: expedition ? (restoredModifiers.length ? restoredModifiers : modifierIdsForCycle(cycle)) : []
    };
  }

  function upgradeLevel(profile, id) {
    return integer(profile?.upgrades?.[id]);
  }

  function inventoryCapacity(profile) {
    return 3 + upgradeLevel(profile, "lexicon");
  }

  function maxInk(profile, run) {
    const bonus = upgradeLevel(profile, "inkwell") * 2;
    const penalty = run?.modifiers?.includes("scarcity") ? 2 : 0;
    return Math.max(8, 12 + bonus - penalty);
  }

  function injectCost(baseCost, run) {
    return Math.max(0, integer(baseCost) + (run?.modifiers?.includes("rewriteTax") ? 1 : 0));
  }

  function threatGain(base, profile, run) {
    if (!run || run.cycle <= 0 || run.failed) return 0;
    const noise = run.modifiers.includes("noise") ? 1.35 : 1;
    const grounding = Math.max(0.6, 1 - upgradeLevel(profile, "grounding") * 0.1);
    return Math.max(1, Math.round(base * noise * grounding));
  }

  function threatRecovery(run) {
    return run?.modifiers?.includes("unstableRecovery") ? 12 : 20;
  }

  function completionReward(profile, run, score = 0) {
    if (run?.cycle > 0) {
      return 8 + run.cycle * 2 + Math.max(0, run.integrity) * 2 + (score >= 90 ? 2 : 0);
    }
    return profile.completedRuns === 0 ? 8 : 2;
  }

  function applyCompletion(profile, run, score = 0) {
    if (run.rewardClaimed) return { profile, reward: 0 };
    const reward = completionReward(profile, run, score);
    profile.echo += reward;
    profile.completedRuns += 1;
    profile.bestScore = Math.max(profile.bestScore, integer(score));
    if (run.cycle > 0) {
      profile.expeditionWins += 1;
      profile.highestCycle = Math.max(profile.highestCycle, run.cycle);
    }
    if (run.integrity === 3 && !profile.achievements.includes("uncollapsed")) {
      profile.achievements.push("uncollapsed");
    }
    run.rewardClaimed = true;
    return { profile, reward };
  }

  function purchaseUpgrade(profile, id) {
    const upgrade = UPGRADES.find((item) => item.id === id);
    if (!upgrade) return { ok: false, reason: "未知铭文。" };
    const level = upgradeLevel(profile, id);
    if (level >= upgrade.maxLevel) return { ok: false, reason: "该铭文已经升满。" };
    const cost = upgrade.costs[level];
    if (profile.echo < cost) return { ok: false, reason: `需要 ${cost} 枚回声残片。` };
    profile.echo -= cost;
    profile.upgrades[id] = level + 1;
    return { ok: true, cost, level: level + 1, upgrade };
  }

  function modifierDetails(run) {
    return (run?.modifiers || [])
      .map((id) => MODIFIERS.find((item) => item.id === id))
      .filter(Boolean);
  }

  root.EchoProgression = Object.freeze({
    UPGRADES,
    MODIFIERS,
    createProfile,
    createRun,
    inventoryCapacity,
    maxInk,
    injectCost,
    threatGain,
    threatRecovery,
    completionReward,
    applyCompletion,
    purchaseUpgrade,
    modifierDetails
  });
})(globalThis);
