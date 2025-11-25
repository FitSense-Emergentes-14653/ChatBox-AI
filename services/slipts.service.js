export function getDaySplitsFromFrequency(freq) {
  // Normalización
  freq = Math.max(1, Math.min(7, Number(freq) || 1));

  switch (freq) {
    case 1:
      return ["FullBody"];

    case 2:
      return ["Upper", "Lower"];

    case 3:
      return ["Upper", "Lower", "Core"];

    case 4:
      return ["Upper", "Lower", "Upper", "Lower"];

    case 5:
      return ["Upper", "Lower", "Core", "Upper", "Lower"];

    case 6:
      return ["Push", "Pull", "Legs", "Upper", "Lower", "Core"];

    case 7:
      return [
        "FullBody",
        "Upper",
        "Lower",
        "Core",
        "Push",
        "Pull",
        "MobilityLight"
      ];

    default:
      return ["Upper", "Lower", "Core"];
  }
}