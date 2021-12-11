import * as React from "react";
import * as ReactDOM from "react-dom";
import craftXIconSrc from "./craftx-icon.png";
import axios from "axios";

interface IBook {
    asin: string | null;
    author: string;
    cover_image_url: string;
    highlights_url: string;
    id: number;
    last_highlight_at: string;
    num_highlights: number;
    source: string;
    source_url: string;
    tags: string[];
    title: string;
    updated: string;
}

interface IHighlight {
    book_id: number;
    color: string;
    highlighted_at: string;
    id: number;
    location: number;
    location_type: "offset" | "order" | "location";
    note: string;
    tags: string[];
    text: string;
    updated: string;
    url: string | null;
}

interface IAggregated {
    id: number;
    book: IBook;
    highlights: IHighlight[];
    imported: boolean;
}

interface IAggregatedMap {
    [id: string]: IAggregated;
}

// TODO: what if user has > 1000 highlights?
async function getReadwiseData(myToken: string, onError: (e: string | null) => void) {
    const cached = await getCachedHighlights();
    let error: string | null = null;
    onError(null);
    const books = await axios
        .get("https://readwise.io/api/v2/books?page_size=1000", {
            headers: { Authorization: `Token ${myToken}` },
        })
        .then(function (response) {
            const results = response.data.results as IBook[];
            const aggregated = Object.fromEntries(
                results.map((result) => [result.id, result])
            );
            return aggregated;
        })
        .catch(function (err) {
            error = err.toString();
        });
    if (!books) {
        onError(error || "No highlights found");
        return;
    }
    const highlights = await axios
        .get("https://readwise.io/api/v2/highlights?page_size=1000", {
            headers: { Authorization: `Token ${myToken}` },
        })
        .then(function (response) {
            const results = response.data.results as IHighlight[];
            const aggregated = results.reduce(
                (acc: { [bookId: number]: IAggregated }, curr: IHighlight) => {
                    if (acc[curr.book_id]) {
                        acc[curr.book_id].highlights.push(curr);
                    } else {
                        acc[curr.book_id] = {
                            id: curr.book_id,
                            book: books[curr.book_id.toString()],
                            highlights: [curr],
                            imported: cached?.[curr.book_id]?.imported
                                ? cached[curr.book_id].imported
                                : false,
                        };
                    }
                    return acc;
                },
                {}
            );
            return aggregated;
        })
        .catch(function (error) {
            onError(error.message);
        });
    await craft.storageApi.put(
        "readwise_highlights",
        JSON.stringify(highlights)
    );
    return highlights;
}

async function getCachedHighlights() {
    const cached = await craft.storageApi.get("readwise_highlights");
    if (cached && cached.data) {
        return JSON.parse(cached.data) as IAggregatedMap;
    }
}

async function getToken() {
    const token = await craft.storageApi.get("api_token");
    return token;
}

async function saveToken(token: string) {
    return await craft.storageApi.put("api_token", token);
}

interface ITokenWidgetProps {
    setToken: (token: string | null) => void;
}

const TokenWidget = (props: ITokenWidgetProps) => {
    const [open, setOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        getToken()
            .then((token) => {
                if (token && token.data) {
                    props.setToken(token.data);
                    if (inputRef.current) {
                        inputRef.current.value = token.data;
                    }
                } else {
                    props.setToken(null);
                }
            })
            .catch(() => {
                props.setToken(null);
            });
    }, [open]);
    const setToken = React.useCallback(async () => {
        const token = inputRef.current?.value || "";
        await saveToken(token);
        props.setToken(token);
    }, []);
    return open ? (
        <div>
            <input
                type="password"
                name="token"
                id="token"
                ref={inputRef}
                onChange={setToken}
            />
            <button
                onClick={async () => {
                    await props.setToken(inputRef.current?.value || null);
                    setOpen(false);
                }}
            >
                Save
            </button>
            <button onClick={() => setOpen(false)}>Cancel</button>
        </div>
    ) : (
        <button onClick={() => setOpen(true)}>Edit Readwise Token</button>
    );
};

const App: React.FC<{}> = () => {
    const [books, setBooks] = React.useState<IAggregatedMap>();
    const [loading, setLoading] = React.useState<boolean>(true);
    const [token, setToken] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const isDarkMode = useCraftDarkMode();

    React.useEffect(() => {
        if (isDarkMode) {
            document.body.classList.add("dark");
        } else {
            document.body.classList.remove("dark");
        }
    }, [isDarkMode]);

    React.useEffect(() => {
        getCachedHighlights()
            .then((books) => {
                if (books) {
                    setBooks(books);
                }
                console.log("Fetching from cache");
                setLoading(false);
                setError(null);
            })
            .catch((error) => {
                setError("Error fetching from cache " + error.message);
                setLoading(false);
            });
    }, []);

    const fetchData = React.useCallback(() => {
        setLoading(true);
        if (!token) {
            setError("No token.");
            setLoading(false);
            return;
        }
        getReadwiseData(token, setError).then((books) => {
            if (books) {
                setBooks(books);
                setError(null);
            }
            setLoading(false);
        });
    }, [token]);

    return (
        <div>
            <TokenWidget setToken={setToken} />
            <button onClick={fetchData} style={{ opacity: loading ? 0.5 : 1 }}>
                Fetch data
            </button>
            {error ? <p>{error}</p> : null}
            {books
                ? Object.values(books)
                      .sort(
                          (bookA, bookB) =>
                              bookB.highlights.length - bookA.highlights.length
                      )
                      .map((book) => {
                          return (
                              <div
                                  key={book.id}
                                  className="wrapper"
                                  style={{
                                      display: "flex",
                                      flexDirection: "row",
                                      justifyContent: "space-between",
                                      margin: "2px 2px",
                                      maxHeight: "60px",
                                      opacity: book.imported ? 0.5 : 1,
                                  }}
                              >
                                  <button
                                      title={book.book.title}
                                      className={`btn ${
                                          isDarkMode ? "dark" : ""
                                      }`}
                                      onClick={() => {
                                          insertHighlights(book);
                                          setBooks({
                                              ...books,
                                              [book.id.toString()]: {
                                                  ...book,
                                                  imported: true,
                                              },
                                          });
                                      }}
                                      style={{
                                          flexGrow: 1,
                                          textAlign: "left",
                                          overflow: "hidden",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                      }}
                                  >
                                      <span className="text">
                                          {book.book.title}
                                      </span>
                                      <span className="count">
                                          {book.highlights.length}
                                      </span>
                                  </button>
                                  <div
                                      style={{
                                          width: "60px",
                                          textAlign: "right",
                                      }}
                                  >
                                      <img
                                          className="icon"
                                          src={book.book.cover_image_url}
                                          alt={book.book.title}
                                          style={{ height: "60px" }}
                                      />
                                  </div>
                              </div>
                          );
                      })
                : null}
        </div>
    );
};

function useCraftDarkMode() {
    const [isDarkMode, setIsDarkMode] = React.useState(false);

    React.useEffect(() => {
        craft.env.setListener((env) =>
            setIsDarkMode(env.colorScheme === "dark")
        );
    }, []);

    return isDarkMode;
}

async function insertHighlights(book: IAggregated) {
    const page = await craft.dataApi.getCurrentPage();
    const pageBlock = page?.data;
    if (pageBlock?.content.length) {
        const block = craft.blockFactory.textBlock({
            content: "Already content on this page",
        });
        craft.dataApi.addBlocks([block]);
    } else {
        craft.dataApi.deleteBlocks(pageBlock?.subblocks.map((b) => b.id) || []);
        const highlightBlocks = book.highlights.map((highlight) =>
            craft.blockFactory.textBlock({
                content: highlight.text,
                listStyle: {
                    type: "bullet",
                },
                indentationLevel: 1,
            })
        );
        const headerBlock = craft.blockFactory.textBlock({
            content: book.book.title,
            style: {
                textStyle: "title",
            },
        });
        craft.dataApi.addBlocks([headerBlock, ...highlightBlocks]);
    }
}

export function initApp() {
    ReactDOM.render(<App />, document.getElementById("react-root"));
}
