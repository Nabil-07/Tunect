// src/components/ReviewStars.tsx
interface ReviewStarsProps {
  rating: number
}

export default function ReviewStars({ rating }: ReviewStarsProps) {
  const stars = Array.from({ length: 5 }, (_, i) => i < rating)

  return (
    <div className="flex gap-1">
      {stars.map((filled, idx) => (
        <span key={idx}>{filled ? '⭐' : '☆'}</span>
      ))}
    </div>
  )
}
