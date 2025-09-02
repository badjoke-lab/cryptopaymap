export const metadata = { title: "About — CryptoPayMap" };

export default function AboutPage(){
  return (
    <div className="container" style={{paddingTop:16}}>
      <h1>About</h1>
      <p style={{marginTop:8}}>
        CryptoPayMap helps you find places that accept crypto payments. Data is sourced primarily from OpenStreetMap contributors and curated datasets.
        Accuracy is not guaranteed — please verify before you go.
      </p>
      <h2 style={{marginTop:16}}>Data & Attribution</h2>
      <ul>
        <li>Base map © OpenStreetMap contributors</li>
        <li>Place data curated from public sources; reported by users</li>
      </ul>
      <h2 style={{marginTop:16}}>Privacy</h2>
      <p>No login is required. We may use privacy-friendly analytics for aggregate usage.</p>
      <h2 style={{marginTop:16}}>Contact</h2>
      <p>Issues or corrections? Open a ticket on the Git repository or contact the maintainer.</p>
    </div>
  );
}
