// Morning starts at 5 AM, not midnight: someone checking in at 1 AM is still
// in their evening, and "Good morning" then reads as a bug.
export const getGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
};
