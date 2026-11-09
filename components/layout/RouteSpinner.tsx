export default function RouteSpinner() {
  return (
    <div className="gg-route-loading__status" role="status" aria-label="Loading page">
      <svg
        className="gg-route-loading__spinner"
        viewBox="0 0 48 48"
        width="56"
        height="56"
        aria-hidden="true"
      >
        {Array.from({ length: 12 }, (_, index) => (
          <circle
            className="gg-route-loading__spinner-dot"
            cx="24"
            cy="5"
            r="3"
            transform={`rotate(${index * 30} 24 24)`}
            style={{ animationDelay: `${index * -0.1}s` }}
            key={index}
          />
        ))}
      </svg>
    </div>
  );
}
