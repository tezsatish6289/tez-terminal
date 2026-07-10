import { FnoNinjaSubscribePage } from "@/components/fnoninja/FnoNinjaSubscribePage";

// The FNONINJA layout already wraps every page in FnoNinjaPageShell (nav +
// footer), so this route only renders its content — wrapping again duplicated
// the nav and footer.
export default function SubscribePage() {
  return <FnoNinjaSubscribePage />;
}
