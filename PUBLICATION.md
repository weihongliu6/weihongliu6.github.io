# Personal website publication
GitHub Pages publishes the personal studio and a navigation gateway only. The only reader platform is https://library.shadowobserverbooks.com/library/ . No book chapter catalog, chapter image set, Auth SDK or reader is published here.

Keep the AI Brief workflow and all non-book personal features. Edit personal content → review PR against latest main → build allowlisted artifact → approve ordinary main merge → GitHub Actions Pages deployment. No Cloudflare content synchronization is required.

The compatibility pages /library/, /library/index.html, /library-update.html and /reader-test/ navigate to the official library, discarding query and fragment parameters. Old Service Workers update normally; no caches or reading data are deleted. Offline old clients can retain their previous shell until they reconnect and update.

Removing current files does not erase Git history, Pages old artifacts, forks or downloaded copies. History remediation requires separate approval. Roll back only to a reviewed gateway/personal-site artifact, never republish old book-body artifacts.
