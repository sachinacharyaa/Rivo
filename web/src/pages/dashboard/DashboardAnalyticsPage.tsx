import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type AnalyticsPayload = {
  window: string;
  visitors: {
    events24h: number;
    events7d: number;
    events30d: number;
  };
  topPages: Array<{ path: string; views: number }>;
  topCountries: Array<{ country: string; views: number }>;
  recent: Array<{
    path: string;
    country: string;
    referrer: string;
    createdAt: string;
  }>;
};

export function DashboardAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    api
      .get<AnalyticsPayload>("/analytics/dashboard")
      .then((res) => setData(res.data))
      .catch(() =>
        setError(
          "Unable to load visitor analytics right now. Try refreshing in a moment.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="gum-page">
      <h1 className="gum-page__h1">Visitor analytics</h1>

      {error ? <div className="error">{error}</div> : null}

      {loading ? (
        <div className="gum-analytics-skeletons">
          {[1, 2, 3].map((k) => (
            <div className="gum-metric-card" key={k} aria-hidden>
              <div className="skeleton-line skeleton-line--title" />
              <div className="skeleton-line skeleton-line--short" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && data ? (
        <>
          <section className="gum-section">
            <h2 className="gum-section__title">Traffic ({data.window})</h2>
            <div className="gum-activity-row">
              <div className="gum-metric-card">
                <div className="gum-metric-card__label">Last 24 hours</div>
                <div className="gum-metric-card__value">{data.visitors.events24h}</div>
              </div>
              <div className="gum-metric-card">
                <div className="gum-metric-card__label">Last 7 days</div>
                <div className="gum-metric-card__value">{data.visitors.events7d}</div>
              </div>
              <div className="gum-metric-card">
                <div className="gum-metric-card__label">Last 30 days</div>
                <div className="gum-metric-card__value">{data.visitors.events30d}</div>
              </div>
            </div>
          </section>

          <section className="gum-section">
            <h2 className="gum-section__title">Top pages</h2>
            {data.topPages.length === 0 ? (
              <div className="empty">No page views yet.</div>
            ) : (
              <div className="gum-analytics-table">
                {data.topPages.map((item) => (
                  <div className="gum-analytics-table__row" key={item.path}>
                    <span className="gum-analytics-table__path">{item.path}</span>
                    <strong>{item.views} views</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="gum-section">
            <h2 className="gum-section__title">Top countries</h2>
            {data.topCountries.length === 0 ? (
              <div className="empty">Country breakdown will appear after traffic arrives.</div>
            ) : (
              <div className="gum-analytics-table">
                {data.topCountries.map((item) => (
                  <div className="gum-analytics-table__row" key={item.country}>
                    <span>{item.country}</span>
                    <strong>{item.views} visits</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="gum-section">
            <h2 className="gum-section__title">Recent visits</h2>
            {data.recent.length === 0 ? (
              <div className="empty">No recent visits yet.</div>
            ) : (
              <div className="gum-analytics-table">
                {data.recent.map((item, idx) => (
                  <div className="gum-analytics-table__row" key={`${item.path}-${item.createdAt}-${idx}`}>
                    <div>
                      <div className="gum-analytics-table__path">{item.path}</div>
                      <div className="gum-analytics-table__meta">
                        {item.country} | {item.referrer}
                      </div>
                    </div>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
