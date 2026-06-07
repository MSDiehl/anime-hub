type RelatedSeason = {
  aniListId: number;
  title: string;
  relationType?: string | null;
  format?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  coverImageUrl?: string | null;
};

type Props = {
  activeAniListId: number;
  relations: RelatedSeason[];
  onSelect: (aniListId: number) => void;
};

export default function AnimeRelationsPanel({
  activeAniListId,
  relations,
  onSelect,
}: Props) {
  return (
    <div className="adSeasonPanel mangaPanel">
      <div className="adPanelTag" aria-hidden="true">
        RELATIONS
      </div>

      {relations.length === 0 ? (
        <div className="adSeasonEmpty">No related anime found yet.</div>
      ) : (
        <div className="adSeasonList">
          {relations.map((item) => {
            const active = item.aniListId === activeAniListId;
            return (
              <button
                key={item.aniListId}
                onClick={() => onSelect(item.aniListId)}
                className={["adSeasonItem", active ? "isActive" : ""].join(" ")}
                title={item.title}
              >
                <div
                  className="adSeasonThumb"
                  style={{
                    backgroundImage: item.coverImageUrl
                      ? `url(${item.coverImageUrl})`
                      : undefined,
                  }}
                />
                <div className="adSeasonText">
                  <div className="adSeasonName">{item.title}</div>
                  <div className="adSeasonMeta">
                    {[
                      humanizeEnum(item.relationType),
                      item.format,
                      item.season || item.seasonYear
                        ? `${item.season ?? ""} ${item.seasonYear ?? ""}`.trim()
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function humanizeEnum(value?: string | null) {
  if (!value) return null;
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
