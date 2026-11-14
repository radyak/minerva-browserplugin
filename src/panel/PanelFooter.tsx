/**
 * The bottom of the panel: the disclaimer, where to report bugs, the build
 * version and the homepage link.
 * @param props.version the build version, shown at the very bottom
 */
export function PanelFooter({ version }: { version: string }) {
  return (
    <footer className="mt-auto">
      <div className="form-text small">
        <p className="mb-1">
          Minerva is a bidding aid only. No responsibility is taken for the correctness of the
          effective prices. Report bugs or file feature requests to{" "}
          <a href="mailto:bgock@proton.me?subject=Minerva Request">this email</a> or on{" "}
          <a
            href="https://github.com/radyak/minerva-browserplugin"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </div>

      <p className="form-text small text-center mt-2 mb-0">
        <a
          href="https://radyak.github.io/minerva-browserplugin/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Homepage
        </a>
        · {" "}
        <a
          href="https://paypal.me/radiculousYak"
          target="_blank"
          rel="noopener noreferrer"
        >
          Send me a coffee
        </a>
         ☕
      </p>

      <p className="form-text small text-center mt-2 mb-0">
        v{version}
      </p>
    </footer>
  );
}
