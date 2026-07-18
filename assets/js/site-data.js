/**
 * Formsmith website content and configuration.
 *
 * Repository-relative paths intentionally have no leading slash so the site works
 * from a GitHub Pages project URL and from a future custom domain. Shared renderers
 * should resolve these paths against the current page's data-base value.
 *
 * Replace the clearly marked contact, social, form endpoint, and domain values
 * before publishing. Never place API keys or other secrets in this file.
 */
window.FORMSMITH_DATA = {
  site: {
    name: "Formsmith",
    tagline: "Forged to order.",
    headline: "Custom business software built around the way you already work.",
    description:
      "Formsmith builds practical custom business software that helps small businesses replace frustrating spreadsheets, paper forms, and disconnected workflows.",
    locale: "en_US",
    language: "en",
    faviconPath: "assets/favicon.svg",

    // Update these if the repository name changes or when a custom domain is connected.
    githubPagesUrl: "https://jcroasdaile1-del.github.io/formsmith-demos/",
    canonicalBaseUrl: "https://jcroasdaile1-del.github.io/formsmith-demos/",
    customDomain: "", // REPLACE_ME when a custom domain is connected.

    contact: {
      // REPLACE_ME: add final contact details before publishing.
      email: "hello@REPLACE-ME.example",
      phoneDisplay: "(000) 000-0000",
      phoneHref: "",
      facebookMessengerUrl: "",
      facebookMessengerLabel: "Message Formsmith on Facebook",
      locationLabel: "Service area to be confirmed",
      address: null,
      isPlaceholder: true
    },

    socialLinks: [
      {
        service: "Facebook",
        label: "Formsmith on Facebook",
        url: "", // REPLACE_ME
        isPlaceholder: true
      }
    ],

    forms: {
      quote: {
        mode: "development", // development | endpoint
        provider: "none", // google-apps-script | formspree | emailjs | other
        endpoint: "", // REPLACE_ME with the public form endpoint; never add a secret.
        method: "POST",
        developmentMessage:
          "Preview mode: your quote request was not sent. Quote submissions will be connected before the site is published.",
        successTitle: "Thank you for telling us about your project.",
        successMessage:
          "Your request was sent successfully. Formsmith will review the details and follow up using the contact information you provided."
      },
      contact: {
        mode: "development", // development | endpoint
        provider: "none",
        endpoint: "", // REPLACE_ME with the public form endpoint; never add a secret.
        method: "POST",
        developmentMessage:
          "Preview mode: your message was not sent. Contact submissions will be connected before the site is published.",
        successTitle: "Message sent.",
        successMessage:
          "Thank you for contacting Formsmith. Your message was sent successfully."
      },
      privacy: {
        policyVersion: "2026-07-14",
        consentLabel:
          "I agree that Formsmith may use the information in this request to respond about my project.",
        policyPath: "privacy.html",
        storageNotice:
          "Form entries remain in the page only while you complete the form and are not saved to local storage."
      }
    }
  },

  navigation: [
    { label: "Home", path: "index.html", page: "home" },
    { label: "Demos", path: "demos.html", page: "demos" },
    { label: "Industries", path: "industries.html", page: "industries" },
    { label: "Pricing", path: "pricing.html", page: "pricing" },
    { label: "About", path: "about.html", page: "about" },
    { label: "FAQ", path: "faq.html", page: "faq" },
    { label: "Contact", path: "contact.html", page: "contact" },
    {
      label: "Request a Quote",
      path: "quote.html",
      page: "quote",
      isPrimaryCta: true
    }
  ],

  projects: [
    {
      slug: "photography-studio-manager",
      title: "Photography Studio Manager",
      demoName: "Daylight Studio",
      shortTitle: "Daylight Studio",
      industry: "Photography",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: true,
      homepageOrder: 0,
      demoOrder: 1,
      eyebrow: "Interactive Demo",
      theme: "amber",
      summary:
        "A polished studio command center for turning new photography inquiries into organized leads, clients, scheduled sessions, prepared shoots, and delivery follow-ups.",
      overview:
        "Photography Studio Manager demonstrates how an independent photographer or small studio could guide each relationship from a public inquiry through lead follow-up, client and session planning, schedule management, shoot readiness, and final delivery.",
      problem:
        "Inquiry details, client preferences, session dates, location notes, shot plans, and delivery commitments can become difficult to track when they are spread across messages, calendars, forms, and separate documents.",
      previousProcess:
        "This concept represents a common photography workflow built around website inquiries, email or text follow-up, a separate calendar, handwritten shoot notes, and manually maintained client folders rather than a claimed client process.",
      solution:
        "One connected workspace can turn a submitted inquiry into a working lead, carry approved details into the client and session record, and keep the schedule, shoot-readiness tasks, and delivery status visible through completion.",
      features: [
        "Public inquiry form",
        "Lead pipeline",
        "Client records",
        "Session scheduling",
        "Studio calendar",
        "Package and payment tracking",
        "Shoot-readiness checklists",
        "Session notes and timelines",
        "Gallery delivery tracking",
        "Business activity dashboard"
      ],
      demo: {
        url: "photography-studio/index.html",
        label: "Launch Daylight Studio Demo",
        external: false,
        placeholder: false,
        notice: "Uses fictional inquiries, clients, sessions, payments, and delivery information."
      },
      detailPath: "projects/photography-studio-manager.html",
      screenshots: [
        {
          src: "portfolio-assets/daylight-dashboard.png",
          alt: "Daylight Studio dashboard showing sample photography inquiries, booked revenue, shoot readiness, upcoming sessions, and gallery deliveries",
          caption: "A daily studio view centered on the next shoot and the work that needs attention",
          width: 1440,
          height: 900,
          placeholder: false
        },
        {
          src: "portfolio-assets/daylight-inquiry.png",
          alt: "Daylight Studio shoot-details inquiry step with selected wedding coverage priorities, must-have moments, and accessibility planning notes beside an editorial photograph",
          caption: "Shoot-ready priorities and planning details that flow into the studio pipeline",
          width: 1440,
          height: 900,
          placeholder: false
        }
      ],
      screenshotPlaceholder: null,
      technology: ["Interactive browser demo"]
    },
    {
      slug: "equipment-rental-manager",
      title: "Equipment Rental Manager",
      demoName: "YardStack",
      industry: "Equipment rental",
      status: "In Development",
      classification: "Internal Project",
      featured: true,
      homepage: true,
      homepageOrder: 1,
      demoOrder: 0,
      eyebrow: "Featured Build",
      summary:
        "A mobile-friendly rental operations system designed to bring equipment, availability, customers, reservations, agreements, inspections, maintenance, and reporting into one practical workspace.",
      overview:
        "Equipment Rental Manager is Formsmith's most feature-rich application in development. The interactive YardStack demo shows the direction of the product using sample rental information and realistic workflows.",
      problem:
        "Rental teams can lose time when inventory, availability, customer records, agreements, payments, inspections, and maintenance are tracked in separate places.",
      previousProcess:
        "The application is designed around a common mix of spreadsheets, paper agreements, calendars, photos, and manual availability checks rather than a claimed client process.",
      solution:
        "One connected workspace can make it easier to see what is available, prepare a reservation, document equipment condition, and keep operational records together.",
      features: [
        "Equipment inventory",
        "Rental availability",
        "Customer records",
        "Reservations",
        "Rental agreements",
        "Payment tracking",
        "Maintenance tracking",
        "Inspection records",
        "Equipment photos",
        "Dashboards and reporting",
        "Mobile-friendly workflows"
      ],
      demo: {
        url: "yardstack/index.html",
        label: "Launch YardStack Demo",
        external: false,
        placeholder: false,
        notice: "Uses sample information and remains part of an in-development build."
      },
      detailPath: "projects/equipment-rental-manager.html",
      screenshots: [
        {
          src: "portfolio-assets/yardstack-dashboard.png",
          alt: "YardStack owner dashboard with pickups, returns, rental revenue, fleet utilization, and operational alerts",
          caption: "Owner workspace for bookings, fleet activity, and revenue",
          width: 1920,
          height: 946,
          placeholder: false
        },
        {
          src: "portfolio-assets/yardstack-booking.png",
          alt: "YardStack sample customer booking catalog with equipment availability, rental pricing, and reservation cart",
          caption: "Sample booking workflow with availability and checkout",
          width: 1920,
          height: 946,
          placeholder: false
        }
      ],
      screenshotPlaceholder: null,
      technology: ["Interactive browser demo"]
    },
    {
      slug: "powerwash-pro",
      title: "PowerWash Pro",
      demoName: "PowerWash Pro",
      industry: "Pressure washing",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: true,
      homepageOrder: 2,
      eyebrow: "Interactive Demo",
      summary:
        "A focused business command center for managing pressure-washing customers, quotes, scheduled work, routes, and revenue.",
      overview:
        "PowerWash Pro demonstrates how a solo operator or small crew could manage the daily flow from a new quote through a scheduled job and completed payment record.",
      problem:
        "Customer details, job notes, pricing, and schedules can become difficult to follow when they are split across a phone, calendar, messages, and spreadsheets.",
      previousProcess:
        "This concept represents a common small-service workflow that relies on manual estimates, separate calendars, and repeated customer entry.",
      solution:
        "A compact workspace organizes quotes, jobs, routes, weather context, and business totals without the overhead of a broad generic platform.",
      features: [
        "Customer records",
        "Quotes and estimates",
        "Job scheduling",
        "Invoices and payments",
        "Route planning",
        "Service pricing",
        "Revenue dashboard",
        "Quote status tracking",
        "Weather context"
      ],
      demo: {
        url: "powerwash-pro/index.html",
        label: "Launch PowerWash Pro Demo",
        external: false,
        placeholder: false,
        notice: "Uses sample customers, jobs, and financial information."
      },
      detailPath: "projects/powerwash-pro.html",
      screenshots: [
        {
          src: "portfolio-assets/powerwash-dashboard.png",
          alt: "PowerWash Pro dashboard showing sample monthly revenue, quote win rate, and today's jobs",
          caption: "Jobs, revenue, and quote activity in one dashboard",
          width: 1917,
          height: 946,
          placeholder: false
        },
        {
          src: "portfolio-assets/powerwash-quotes.png",
          alt: "PowerWash Pro sample quotes list with pricing and status",
          caption: "Configurable estimating and quote tracking",
          width: 1918,
          height: 947,
          placeholder: false
        }
      ],
      screenshotPlaceholder: null,
      technology: ["Interactive browser demo"]
    },
    {
      slug: "dog-grooming-manager",
      title: "Dog Grooming Manager",
      demoName: "Grooming Salon Manager",
      industry: "Pet grooming",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: true,
      homepageOrder: 3,
      eyebrow: "Interactive Demo",
      summary:
        "A client and pet management workspace for appointments, service history, intake details, checkout, and salon reporting.",
      overview:
        "Dog Grooming Manager demonstrates how a grooming business could keep client records, multiple pets, appointment details, services, and business activity together.",
      problem:
        "A grooming team may need to search several calendars, messages, paper notes, or spreadsheets to understand a pet's needs and prior services.",
      previousProcess:
        "This concept is based on a common mix of appointment calendars, handwritten grooming notes, contact lists, and manually maintained totals.",
      solution:
        "A purpose-built manager can connect each client with their pets, service notes, appointments, and checkout records while keeping the interface easy to scan.",
      features: [
        "Client and pet records",
        "Appointment tracking",
        "Pet care notes",
        "Service history",
        "Multi-pet intake",
        "Checkout workflow",
        "CSV data import",
        "Revenue and service dashboard"
      ],
      demo: {
        url: "grooming-dashboard-demo.html",
        label: "Launch Dog Grooming Demo",
        external: false,
        placeholder: false,
        notice: "Uses fictional clients, pets, appointments, and financial information."
      },
      detailPath: "projects/dog-grooming-manager.html",
      screenshots: [
        {
          src: "portfolio-assets/grooming-dashboard1.png",
          alt: "Grooming salon sample dashboard with revenue by service and service breakdown",
          caption: "Sample salon activity and service dashboard",
          width: 1918,
          height: 946,
          placeholder: false
        },
        {
          src: "portfolio-assets/grooming-client-form.png",
          alt: "Grooming salon sample client and multi-pet intake form",
          caption: "Client and multi-pet intake in one form",
          width: 1919,
          height: 947,
          placeholder: false
        }
      ],
      screenshotPlaceholder: null,
      technology: ["Interactive browser demo"]
    },
    {
      slug: "house-cleaning-manager",
      title: "House Cleaning Manager",
      demoName: "CleanSlate",
      industry: "House cleaning",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: true,
      homepageOrder: 4,
      eyebrow: "Interactive Demo",
      summary:
        "A scheduling and business management demo for recurring and one-time cleaning jobs, customers, services, and revenue.",
      overview:
        "House Cleaning Manager demonstrates a clear daily workspace for a small cleaning business, with customer details, a color-coded schedule, service information, and reporting.",
      problem:
        "Recurring visits, one-time jobs, customer instructions, and schedule changes can be hard to coordinate when details live in separate messages and calendars.",
      previousProcess:
        "This concept reflects a common workflow built from a calendar, customer contact list, service notes, and a separate revenue spreadsheet.",
      solution:
        "A single manager can make scheduled work visible, keep customer instructions attached to the job, and summarize business activity without repeated entry.",
      features: [
        "Customer records",
        "Recurring job scheduling",
        "One-time service scheduling",
        "Color-coded calendar",
        "Service notes",
        "Job status tracking",
        "Invoices and expenses",
        "Revenue dashboard",
        "Service mix reporting"
      ],
      demo: {
        url: "house-cleaning-demo.html",
        label: "Launch House Cleaning Demo",
        external: false,
        placeholder: false,
        notice: "Uses fictional customers, jobs, schedules, and financial information."
      },
      detailPath: "projects/house-cleaning-manager.html",
      screenshots: [
        {
          src: "portfolio-assets/cleanslate-dashboard.png",
          alt: "CleanSlate sample dashboard showing weekly revenue and service breakdown",
          caption: "Sample revenue and service activity dashboard",
          width: 1919,
          height: 947,
          placeholder: false
        },
        {
          src: "portfolio-assets/cleanslate-schedule.png",
          alt: "CleanSlate sample monthly schedule with color-coded cleaning jobs",
          caption: "Month view for recurring and one-time jobs",
          width: 1919,
          height: 946,
          placeholder: false
        }
      ],
      screenshotPlaceholder: null,
      technology: ["Interactive browser demo"]
    },
    {
      slug: "travel-agency-manager",
      title: "Travel Agency Manager",
      demoName: "Travel Agency Command Center",
      industry: "Travel services",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: false,
      homepageOrder: null,
      eyebrow: "Interactive Demo",
      summary:
        "A command center for organizing travelers, trips, quotes, options, documents, follow-ups, and agency activity.",
      overview:
        "Travel Agency Manager demonstrates how a travel professional could guide a trip from the first inquiry through options, documents, and follow-up without rebuilding the same client details in several files.",
      problem:
        "Trip details can spread across email threads, supplier pages, documents, notes, and spreadsheets, making it harder to see what a traveler needs next.",
      previousProcess:
        "This concept represents a common travel-planning process that moves among messages, quote documents, calendars, and manually maintained client records.",
      solution:
        "A dedicated workspace can connect the traveler, trip, quote options, documents, tasks, and important dates while leaving supplier booking systems in their appropriate role.",
      features: [
        "Traveler records",
        "Lead tracking",
        "Trip tracking",
        "Quote options",
        "Payment tracking",
        "Document generation",
        "Follow-up tasks",
        "Important date tracking",
        "Supplier notes",
        "Agency dashboard"
      ],
      demo: {
        url: "travel-agency-command-center/index.html",
        label: "Launch Travel Agency Demo",
        external: false,
        placeholder: false,
        notice: "Uses fictional travelers, trips, quotes, and documents."
      },
      detailPath: "projects/travel-agency-manager.html",
      screenshots: [],
      screenshotPlaceholder: {
        title: "Travel Agency Manager interface preview",
        description: "A polished preview image can be added after final branding is selected."
      },
      technology: ["Interactive browser demo"]
    },
    {
      slug: "archery-league-manager",
      title: "Archery League Manager",
      demoName: "Buckskin Bowmen League Manager",
      industry: "Clubs and leagues",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: false,
      homepageOrder: null,
      eyebrow: "Interactive Demo",
      summary:
        "A season and score management demo for teams, weekly results, averages, standings, and league reporting.",
      overview:
        "Archery League Manager demonstrates how a club could organize a season, enter weekly scores, calculate averages, and make current standings easier to review.",
      problem:
        "League volunteers can spend substantial time updating scores, recalculating averages, and preparing standings when each week is managed manually.",
      previousProcess:
        "This demo models a spreadsheet-heavy process with repeated score entry, hand-checked calculations, and separate team lists.",
      solution:
        "A league-specific system can keep teams and scores connected, apply consistent calculations, and present the season in a clearer dashboard.",
      features: [
        "Season setup",
        "Team rosters",
        "League schedules",
        "Weekly score entry",
        "Automatic averages",
        "Handicap calculations",
        "Standings",
        "Bracket views",
        "Score distribution dashboard",
        "League reporting"
      ],
      demo: {
        url: "archery-league-demo.html",
        label: "Launch Archery League Demo",
        external: false,
        placeholder: false,
        notice: "Uses sample teams, members, and scores."
      },
      detailPath: "projects/archery-league-manager.html",
      screenshots: [
        {
          src: "portfolio-assets/archery-dashboard.png",
          alt: "Archery league sample dashboard with score distribution and season statistics",
          caption: "Season scores and statistics dashboard",
          width: 1917,
          height: 946,
          placeholder: false
        },
        {
          src: "portfolio-assets/archery-teams.png",
          alt: "Archery league sample team roster with qualifying averages",
          caption: "Team roster with calculated averages",
          width: 1919,
          height: 944,
          placeholder: false
        }
      ],
      screenshotPlaceholder: null,
      technology: ["Interactive browser demo"]
    },
    {
      slug: "teacher-tracker",
      title: "Teacher Tracker",
      demoName: "Student Data Command Center",
      industry: "Education",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: false,
      homepageOrder: null,
      eyebrow: "Interactive Demo",
      summary:
        "A classroom data workspace for student records, assessments, behavior notes, communication logs, and useful summaries.",
      overview:
        "Teacher Tracker demonstrates how an educator could bring frequently referenced classroom information into a focused system shaped around the way they record and review student data.",
      problem:
        "Assessment data, behavior notes, forms, and parent communication logs may be kept in different documents, making patterns and next steps harder to see.",
      previousProcess:
        "This concept reflects a common collection of spreadsheets, paper notes, school-provided exports, and separate communication records.",
      solution:
        "A custom tracker can organize the fields a teacher actually uses and present class-level and student-level information in clear views.",
      features: [
        "Student records",
        "Assessment tracking",
        "Behavior records",
        "Parent communication logs",
        "Classroom forms",
        "Student-level history",
        "Class data dashboard",
        "Custom reporting views"
      ],
      demo: {
        url: "teacher-dashboard-demo.html",
        label: "Launch Teacher Tracker Demo",
        external: false,
        placeholder: false,
        notice: "Uses fictional students and sample classroom information."
      },
      detailPath: "projects/teacher-tracker.html",
      screenshots: [],
      screenshotPlaceholder: {
        title: "Teacher Tracker interface preview",
        description: "A polished preview image can be added after final branding is selected."
      },
      technology: ["Interactive browser demo"]
    },
    {
      slug: "equipment-inventory-profit-tracker",
      title: "Equipment Inventory and Profit Tracker",
      demoName: "C&C Equipment",
      industry: "Equipment sales",
      status: "Live Demo",
      classification: "Concept Demo",
      featured: false,
      homepage: false,
      homepageOrder: null,
      eyebrow: "Interactive Demo",
      summary:
        "An inventory and sales tracking demo for equipment details, acquisition costs, preparation expenses, sale values, and estimated profit.",
      overview:
        "Equipment Inventory and Profit Tracker demonstrates how a small seller could follow each item from acquisition through preparation and sale while keeping cost and margin details visible.",
      problem:
        "Purchase costs, repairs, parts, photos, listing details, and final sale figures can become disconnected when every item is tracked in a different note or spreadsheet row.",
      previousProcess:
        "This concept represents a common inventory process built from receipts, photos, marketplace listings, notes, and a spreadsheet used to estimate profit.",
      solution:
        "A focused tracker can keep the full cost history and current status attached to each item, making inventory and estimated margin easier to review.",
      features: [
        "Equipment inventory",
        "Purchase cost tracking",
        "Repair and preparation costs",
        "Equipment photos",
        "Listing information",
        "Sales records",
        "Estimated profit calculations",
        "Inventory dashboard"
      ],
      demo: {
        url: "cc-equipment/index.html",
        label: "Launch Equipment Tracker Demo",
        external: false,
        placeholder: false,
        notice: "Uses sample equipment, costs, sales, and financial information."
      },
      detailPath: "projects/equipment-inventory-profit-tracker.html",
      screenshots: [],
      screenshotPlaceholder: {
        title: "Equipment Inventory and Profit Tracker interface preview",
        description: "A polished preview image can be added after final branding is selected."
      },
      technology: ["Interactive browser demo"]
    }
  ],

  industries: [
    {
      slug: "contractors",
      name: "Contractors",
      icon: "wrench",
      summary:
        "Keep leads, estimates, scheduled work, project details, photos, and follow-ups connected from the first call through completion.",
      examples: [
        "Lead tracking",
        "Customer records",
        "Estimates",
        "Job scheduling",
        "Project photos",
        "Invoice preparation",
        "Follow-up reminders"
      ]
    },
    {
      slug: "home-service-businesses",
      name: "Home service businesses",
      icon: "gear",
      summary:
        "Build a straightforward daily workspace for customer requests, property notes, routes, recurring services, crews, and completed work.",
      examples: [
        "Service requests",
        "Property and customer history",
        "Recurring job schedules",
        "Route planning",
        "Crew assignments",
        "Work completion forms",
        "Service reminders"
      ]
    },
    {
      slug: "equipment-rental-companies",
      name: "Equipment rental companies",
      icon: "layers",
      summary:
        "See equipment availability and keep reservations, customer history, agreements, inspections, maintenance, and payment records together.",
      examples: [
        "Equipment inventory",
        "Availability calendars",
        "Reservations",
        "Rental agreements",
        "Inspections",
        "Maintenance",
        "Payment tracking",
        "Customer history"
      ]
    },
    {
      slug: "pressure-washing-companies",
      name: "Pressure washing companies",
      icon: "file",
      summary:
        "Move from inquiry to estimate and scheduled job with customer, property, pricing, route, and service details in one place.",
      examples: [
        "Lead intake",
        "Property measurements",
        "Quotes and estimates",
        "Job scheduling",
        "Route planning",
        "Before-and-after photos",
        "Payment status",
        "Revenue reporting"
      ]
    },
    {
      slug: "cleaning-businesses",
      name: "Cleaning businesses",
      icon: "spark",
      summary:
        "Coordinate recurring and one-time jobs while keeping access instructions, service checklists, schedules, and customer preferences easy to find.",
      examples: [
        "Customer and property records",
        "Recurring schedules",
        "One-time bookings",
        "Service checklists",
        "Crew assignments",
        "Access and preference notes",
        "Job status tracking",
        "Business dashboards"
      ]
    },
    {
      slug: "pet-groomers",
      name: "Pet groomers",
      icon: "users",
      summary:
        "Connect each client with their pets, appointments, service preferences, care notes, history, and checkout details.",
      examples: [
        "Client and pet profiles",
        "Appointment scheduling",
        "Grooming and care notes",
        "Vaccination information fields",
        "Service history",
        "Intake forms",
        "Checkout records",
        "Salon reporting"
      ]
    },
    {
      slug: "teachers",
      name: "Teachers",
      icon: "clipboard",
      summary:
        "Shape classroom tracking around the records and views an educator actually needs without forcing every class into a generic template.",
      examples: [
        "Student tracking",
        "Assessments",
        "Behavior records",
        "Parent communication logs",
        "Classroom data dashboards",
        "Custom forms"
      ]
    },
    {
      slug: "travel-professionals",
      name: "Travel professionals",
      icon: "calendar",
      summary:
        "Organize travelers, trip details, options, documents, important dates, and follow-ups around an agency's own planning process.",
      examples: [
        "Traveler profiles",
        "Trip pipelines",
        "Quote options",
        "Supplier notes",
        "Document generation",
        "Payment date tracking",
        "Follow-up tasks",
        "Agency dashboards"
      ]
    },
    {
      slug: "clubs-and-leagues",
      name: "Clubs and leagues",
      icon: "users",
      summary:
        "Reduce repetitive administration with purpose-built member, team, season, scheduling, score, and standings tools.",
      examples: [
        "Member records",
        "Team rosters",
        "Season setup",
        "Event scheduling",
        "Score entry",
        "Automatic calculations",
        "Standings",
        "League reports"
      ]
    },
    {
      slug: "small-equipment-sellers",
      name: "Small equipment sellers",
      icon: "database",
      summary:
        "Follow equipment from purchase through repairs, listing, and sale with costs, photos, status, and estimated margin attached to each item.",
      examples: [
        "Equipment inventory",
        "Acquisition costs",
        "Repair and parts tracking",
        "Equipment photos",
        "Listing details",
        "Sales records",
        "Profit estimates",
        "Inventory reporting"
      ]
    },
    {
      slug: "other-local-businesses",
      name: "Other local businesses",
      icon: "dashboard",
      summary:
        "Every Formsmith application starts with the business workflow, so a company does not need to fit a predefined industry template.",
      examples: [
        "Custom customer records",
        "Operational forms",
        "Scheduling",
        "Inventory or asset tracking",
        "Workflow automation",
        "Document generation",
        "Dashboards",
        "Google Sheets-powered apps"
      ]
    }
  ],

  faqs: [
    {
      question: "What does Formsmith build?",
      answer:
        "Formsmith builds practical custom business software such as customer managers, scheduling tools, quote and job trackers, inventory systems, operational forms, dashboards, reports, document workflows, and Google Sheets-powered business apps. The exact screens and features are shaped around the way each business works."
    },
    {
      question: "Who is Formsmith for?",
      answer:
        "Formsmith is focused on small businesses, solo entrepreneurs, contractors, local service companies, and teachers who have outgrown spreadsheets, paper forms, or a collection of disconnected tools. Businesses with larger teams are welcome to request a quote so the scope can be evaluated."
    },
    {
      question: "Can you replace my spreadsheet?",
      answer:
        "Often, yes. A spreadsheet may be a good starting point because it shows the information and calculations your business already relies on. Formsmith can review the current process and determine which parts make sense to move into a clearer custom system. Some spreadsheets may remain useful alongside the new workflow."
    },
    {
      question: "Do I need to know exactly what I want before contacting you?",
      answer:
        "No. It is enough to explain what is slowing you down, what tools you use now, and what you wish were easier. The quote process is designed to help map the workflow before a solution and scope are proposed."
    },
    {
      question: "Can I try a demo?",
      answer:
        "Yes. The Demos page links to interactive examples that use fictional sample information. They are intended to demonstrate possible workflows and interface ideas, not off-the-shelf products or completed client results."
    },
    {
      question: "Is every project custom?",
      answer:
        "Yes. Formsmith may reuse reliable design patterns and development approaches, but the workflow, terminology, screens, fields, and priorities are selected for the individual project rather than forced into a generic template."
    },
    {
      question: "How much does a project cost?",
      answer:
        "Formsmith caps every custom build budget at $5,000. Each project is still quoted individually based on the workflow, screens, data, automation, reporting, mobile use, revisions, and support involved. Any third-party hosting, service, or optional ongoing-support costs will be identified separately before work begins. The initial quote request is free."
    },
    {
      question: "How long does a project take?",
      answer:
        "Timing depends on the size of the workflow, the readiness of existing information, revision needs, and any integrations. Formsmith will discuss an estimated schedule after reviewing the request; a completion date is not guaranteed until the project scope and terms are agreed."
    },
    {
      question: "Will the software work on mobile devices?",
      answer:
        "Mobile-friendly use can be included as a project priority. The specific devices, screen sizes, connectivity needs, and workflows should be discussed during scoping so the proposed approach fits how the software will be used."
    },
    {
      question: "Can you work with my existing Google Sheets data?",
      answer:
        "Potentially. Existing Google Sheets files can help explain the current workflow, and some projects may use Sheets as a data source or import existing rows. Formsmith will need to review the structure and quality of the data before confirming an import or integration approach."
    },
    {
      question: "Do you provide revisions?",
      answer:
        "Revision and feedback rounds can be included in a project proposal. The number, timing, and scope of revisions will be defined before work begins so expectations are clear."
    },
    {
      question: "Will I own my business data?",
      answer:
        "Yes. You will own your business data. The project agreement will document how you can access or export it, along with any project-specific storage, hosting, or third-party service responsibilities."
    },
    {
      question: "Will I own the software and source code?",
      answer:
        "Your business data belongs to you. Ownership or licensing of the application, source code, reusable Formsmith components, hosting setup, and handoff materials is a separate matter that will be stated clearly in the project agreement before work begins."
    },
    {
      question: "Does Formsmith provide support after launch?",
      answer:
        "Post-launch support may be available depending on the project. Any included support period, maintenance work, response expectations, hosting responsibilities, and ongoing costs will be described in the proposal or a separate support arrangement."
    },
    {
      question: "Can you build software for an industry not listed on the site?",
      answer:
        "Yes. The listed industries are examples, not limits. If a business has a repeatable process, scattered information, or a spreadsheet that has become difficult to manage, Formsmith can review the workflow and determine whether a custom system is a practical fit."
    }
  ],

  quoteOptions: {
    employeeCounts: [
      { value: "just-me", label: "Just me" },
      { value: "2-5", label: "2-5" },
      { value: "6-10", label: "6-10" },
      { value: "more-than-10", label: "More than 10" }
    ],
    currentTools: [
      { value: "google-sheets", label: "Google Sheets" },
      { value: "microsoft-excel", label: "Microsoft Excel" },
      { value: "paper-forms", label: "Paper forms" },
      { value: "email", label: "Email" },
      { value: "text-messages", label: "Text messages" },
      { value: "calendar", label: "Calendar" },
      { value: "existing-business-software", label: "Existing business software" },
      { value: "other", label: "Other" }
    ],
    processFrequencies: [
      { value: "several-times-daily", label: "Several times a day" },
      { value: "daily", label: "Daily" },
      { value: "several-times-weekly", label: "Several times a week" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "occasionally", label: "Occasionally" },
      { value: "varies", label: "It varies" }
    ],
    capabilities: [
      { value: "customer-management", label: "Customer management" },
      { value: "scheduling", label: "Scheduling" },
      { value: "quotes-estimates", label: "Quotes or estimates" },
      { value: "job-tracking", label: "Job tracking" },
      { value: "inventory", label: "Inventory" },
      { value: "equipment-tracking", label: "Equipment tracking" },
      { value: "rental-management", label: "Rental management" },
      { value: "forms", label: "Forms" },
      { value: "photo-uploads", label: "Photo uploads" },
      { value: "dashboards", label: "Dashboards" },
      { value: "reports", label: "Reports" },
      { value: "automated-reminders", label: "Automated reminders" },
      { value: "document-generation", label: "Document generation" },
      { value: "not-sure", label: "I am not sure yet" },
      { value: "other", label: "Other" }
    ],
    yesNoUnsure: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "not-sure", label: "I am not sure" }
    ],
    startTimeframes: [
      { value: "as-soon-as-practical", label: "As soon as practical" },
      { value: "within-1-month", label: "Within 1 month" },
      { value: "within-1-3-months", label: "Within 1-3 months" },
      { value: "within-3-6-months", label: "Within 3-6 months" },
      { value: "more-than-6-months", label: "More than 6 months from now" },
      { value: "exploring", label: "I am exploring options" }
    ],
    budgetRanges: [
      { value: "not-sure", label: "I am not sure yet" },
      { value: "under-1000", label: "Under $1,000" },
      { value: "1000-2499", label: "$1,000-$2,499" },
      { value: "2500-5000", label: "$2,500-$5,000" }
    ]
  }
};
