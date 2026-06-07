type Props = {
  sanitizedDescription: string;
};

export default function AnimeOverviewPanel({ sanitizedDescription }: Props) {
  return (
    <section className="adPanel mangaPanel">
      <div className="adPanelTag" aria-hidden="true">
        Overview
      </div>

      <div
        className="adDesc"
        dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
      />
    </section>
  );
}
