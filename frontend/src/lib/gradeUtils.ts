export const getScoreColor = (score: number | null) => {
  if (score === null) return 'default'
  if (score >= 90) return 'green'
  if (score >= 80) return 'cyan'
  if (score >= 70) return 'blue'
  if (score >= 60) return 'orange'
  return 'red'
}
