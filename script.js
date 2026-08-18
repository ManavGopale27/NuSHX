/* =========================================================
   NUSHX — AI PDF ASSISTANT
   Frontend Logic
========================================================= */


/* =========================================================
   ELEMENTS
========================================================= */

const pdfFile = document.getElementById("pdfFile");

const uploadArea = document.getElementById("uploadArea");

const selectedFile = document.getElementById("selectedFile");

const fileName = document.getElementById("fileName");

const fileSize = document.getElementById("fileSize");

const removeFile = document.getElementById("removeFile");

const documentStatus =
    document.getElementById("documentStatus");

const statusText =
    document.getElementById("statusText");

const pageCount =
    document.getElementById("pageCount");

const chunkCount =
    document.getElementById("chunkCount");

const processingStatus =
    document.getElementById("processingStatus");

const questionInput =
    document.getElementById("questionInput");

const askButton =
    document.getElementById("askButton");

const chatArea =
    document.getElementById("chatArea");

const emptyChat =
    document.getElementById("emptyChat");

const suggestions =
    document.querySelectorAll(".suggestion");

const contextPanel =
    document.getElementById("contextPanel");

const contextText =
    document.getElementById("contextText");

const similarityScore =
    document.getElementById("similarityScore");


/* =========================================================
   PIPELINE ELEMENTS
========================================================= */

const pipelineSteps = {

    upload:
        document.getElementById("stepUpload"),

    extract:
        document.getElementById("stepExtract"),

    chunk:
        document.getElementById("stepChunk"),

    tfidf:
        document.getElementById("stepTfidf"),

    retrieve:
        document.getElementById("stepRetrieve"),

    ai:
        document.getElementById("stepAI")

};


/* =========================================================
   STATE
========================================================= */

let selectedPdf = null;

let pdfProcessed = false;

let isAsking = false;


/* =========================================================
   INITIAL STATE
========================================================= */

function initialize() {

    resetPipeline();

    setDocumentStatus(
        "Waiting for PDF",
        "default"
    );

    questionInput.disabled = true;

    askButton.disabled = true;

}


initialize();


/* =========================================================
   FILE INPUT
========================================================= */

pdfFile.addEventListener(
    "change",
    function () {

        const file = this.files[0];

        if (!file) {
            return;
        }

        handleSelectedFile(file);

    }
);


/* =========================================================
   HANDLE SELECTED FILE
========================================================= */

function handleSelectedFile(file) {

    /* ---------------------------------------------
       Check file type
    --------------------------------------------- */

    if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
    ) {

        showError(
            "Please select a PDF file."
        );

        pdfFile.value = "";

        return;
    }


    /* ---------------------------------------------
       Check file size
    --------------------------------------------- */

    const maxSize =
        20 * 1024 * 1024;


    if (file.size > maxSize) {

        showError(
            "PDF is too large. Please use a file under 20 MB."
        );

        pdfFile.value = "";

        return;
    }


    /* ---------------------------------------------
       Save state
    --------------------------------------------- */

    selectedPdf = file;

    pdfProcessed = false;


    /* ---------------------------------------------
       Show selected file
    --------------------------------------------- */

    fileName.textContent =
        file.name;

    fileSize.textContent =
        formatFileSize(file.size);

    selectedFile.classList.add(
        "visible"
    );


    /* ---------------------------------------------
       Reset statistics
    --------------------------------------------- */

    pageCount.textContent = "—";

    chunkCount.textContent = "—";

    processingStatus.textContent =
        "READY";


    /* ---------------------------------------------
       Reset chat
    --------------------------------------------- */

    resetChat();


    /* ---------------------------------------------
       Enable processing state
    --------------------------------------------- */

    setDocumentStatus(
        "PDF selected — ready to process",
        "processing"
    );


    /* ---------------------------------------------
       Automatically upload
    --------------------------------------------- */

    uploadPdf();

}


/* =========================================================
   UPLOAD PDF
========================================================= */

async function uploadPdf() {

    if (!selectedPdf) {

        showError(
            "Please select a PDF first."
        );

        return;
    }


    /* ---------------------------------------------
       UI state
    --------------------------------------------- */

    setDocumentStatus(
        "Uploading PDF...",
        "processing"
    );

    processingStatus.textContent =
        "UPLOAD";


    resetPipeline();

    activatePipeline(
        "upload"
    );


    /* ---------------------------------------------
       Form data
    --------------------------------------------- */

    const formData =
        new FormData();

    formData.append(
        "file",
        selectedPdf
    );


    try {

        /* -----------------------------------------
           Upload request
        ----------------------------------------- */

        const response =
            await fetch(
                "/upload",
                {
                    method: "POST",
                    body: formData
                }
            );


        const data =
            await response.json();


        /* -----------------------------------------
           Handle backend error
        ----------------------------------------- */

        if (!response.ok || !data.success) {

            throw new Error(
                data.error ||
                "PDF processing failed."
            );

        }


        /* -----------------------------------------
           Processing animation
        ----------------------------------------- */

        await runProcessingAnimation();


        /* -----------------------------------------
           Update stats
        ----------------------------------------- */

        pageCount.textContent =
            data.pages;

        chunkCount.textContent =
            data.chunks;

        processingStatus.textContent =
            "READY";


        /* -----------------------------------------
           Success state
        ----------------------------------------- */

        pdfProcessed = true;

        setDocumentStatus(
            "PDF processed successfully",
            "success"
        );


        /* -----------------------------------------
           Enable question input
        ----------------------------------------- */

        questionInput.disabled =
            false;

        askButton.disabled =
            false;


        questionInput.focus();


        /* -----------------------------------------
           Welcome message
        ----------------------------------------- */

        showWelcomeMessage(
            data.filename,
            data.pages,
            data.chunks
        );


    } catch (error) {

        console.error(
            "NUSHX upload error:",
            error
        );


        pdfProcessed = false;

        questionInput.disabled =
            true;

        askButton.disabled =
            true;


        processingStatus.textContent =
            "ERROR";


        setDocumentStatus(
            error.message,
            "error"
        );

    }

}


/* =========================================================
   PROCESSING ANIMATION
========================================================= */

async function runProcessingAnimation() {

    activatePipeline(
        "extract"
    );

    await wait(450);


    activatePipeline(
        "chunk"
    );

    await wait(450);


    activatePipeline(
        "tfidf"
    );

    await wait(450);


    completePipeline(
        "extract"
    );

    completePipeline(
        "chunk"
    );

    completePipeline(
        "tfidf"
    );


    activatePipeline(
        "retrieve"
    );

    await wait(300);


    completePipeline(
        "retrieve"
    );


    activatePipeline(
        "ai"
    );

    await wait(300);


    completePipeline(
        "ai"
    );

}


/* =========================================================
   ASK BUTTON
========================================================= */

askButton.addEventListener(
    "click",
    askQuestion
);


/* =========================================================
   ENTER KEY
========================================================= */

questionInput.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            askQuestion();

        }

    }
);


/* =========================================================
   ASK QUESTION
========================================================= */

async function askQuestion() {

    if (isAsking) {
        return;
    }


    if (!pdfProcessed) {

        showError(
            "Please upload and process a PDF first."
        );

        return;
    }


    const question =
        questionInput.value.trim();


    if (!question) {

        questionInput.focus();

        return;
    }


    /* ---------------------------------------------
       Asking state
    --------------------------------------------- */

    isAsking = true;

    askButton.disabled = true;


    /* ---------------------------------------------
       Hide empty state
    --------------------------------------------- */

    if (emptyChat) {

        emptyChat.style.display =
            "none";

    }


    /* ---------------------------------------------
       Add user message
    --------------------------------------------- */

    addMessage(
        question,
        "user"
    );


    /* ---------------------------------------------
       Clear input
    --------------------------------------------- */

    questionInput.value = "";


    /* ---------------------------------------------
       AI loading message
    --------------------------------------------- */

    const loadingMessage =
        addLoadingMessage();


    /* ---------------------------------------------
       Pipeline
    --------------------------------------------- */

    resetPipeline();

    activatePipeline(
        "retrieve"
    );


    try {

        const response =
            await fetch(
                "/ask",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            question:
                                question
                        })
                }
            );


        const data =
            await response.json();


        /* -----------------------------------------
           Remove loading
        ----------------------------------------- */

        removeLoadingMessage(
            loadingMessage
        );


        /* -----------------------------------------
           Error
        ----------------------------------------- */

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.error ||
                "Unable to generate an answer."
            );

        }


        /* -----------------------------------------
           Complete pipeline
        ----------------------------------------- */

        completePipeline(
            "retrieve"
        );

        activatePipeline(
            "ai"
        );

        await wait(350);

        completePipeline(
            "ai"
        );


        /* -----------------------------------------
           AI answer
        ----------------------------------------- */

        addMessage(
            data.answer,
            "ai"
        );


        /* -----------------------------------------
           Context
        ----------------------------------------- */

        if (
            data.context
        ) {

            contextPanel.hidden =
                false;

            contextText.textContent =
                data.context;


            similarityScore.textContent =
                `${data.similarity || 0}% match`;

        }


    } catch (error) {

        console.error(
            "NUSHX question error:",
            error
        );


        removeLoadingMessage(
            loadingMessage
        );


        addMessage(
            `⚠️ ${error.message}`,
            "ai"
        );

    }


    /* ---------------------------------------------
       Reset asking state
    --------------------------------------------- */

    isAsking = false;

    askButton.disabled = false;

    questionInput.focus();

}


/* =========================================================
   SUGGESTION BUTTONS
========================================================= */

suggestions.forEach(
    function (button) {

        button.addEventListener(
            "click",
            function () {

                const question =
                    button.textContent.trim();


                if (!pdfProcessed) {

                    showError(
                        "Upload a PDF first."
                    );

                    return;
                }


                questionInput.value =
                    question;


                questionInput.focus();


                autoResizeTextarea();

            }
        );

    }
);


/* =========================================================
   TEXTAREA AUTO RESIZE
========================================================= */

questionInput.addEventListener(
    "input",
    autoResizeTextarea
);


function autoResizeTextarea() {

    questionInput.style.height =
        "auto";

    questionInput.style.height =
        Math.min(
            questionInput.scrollHeight,
            100
        ) + "px";

}


/* =========================================================
   REMOVE PDF
========================================================= */

removeFile.addEventListener(
    "click",
    function () {

        selectedPdf = null;

        pdfProcessed = false;


        pdfFile.value = "";


        selectedFile.classList.remove(
            "visible"
        );


        pageCount.textContent =
            "—";

        chunkCount.textContent =
            "—";

        processingStatus.textContent =
            "—";


        questionInput.value = "";

        questionInput.disabled =
            true;

        askButton.disabled =
            true;


        contextPanel.hidden =
            true;


        resetChat();

        resetPipeline();


        setDocumentStatus(
            "Waiting for PDF",
            "default"
        );

    }
);


/* =========================================================
   DRAG & DROP
========================================================= */

uploadArea.addEventListener(
    "dragover",
    function (event) {

        event.preventDefault();

        uploadArea.classList.add(
            "drag-over"
        );

    }
);


uploadArea.addEventListener(
    "dragleave",
    function () {

        uploadArea.classList.remove(
            "drag-over"
        );

    }
);


uploadArea.addEventListener(
    "drop",
    function (event) {

        event.preventDefault();

        uploadArea.classList.remove(
            "drag-over"
        );


        const file =
            event.dataTransfer.files[0];


        if (!file) {
            return;
        }


        handleSelectedFile(file);

    }
);


/* =========================================================
   STATUS
========================================================= */

function setDocumentStatus(
    message,
    type
) {

    statusText.textContent =
        message;


    documentStatus.classList.remove(
        "processing",
        "success",
        "error"
    );


    if (type) {

        documentStatus.classList.add(
            type
        );

    }

}


/* =========================================================
   ERROR
========================================================= */

function showError(message) {

    setDocumentStatus(
        message,
        "error"
    );

}


/* =========================================================
   PIPELINE — RESET
========================================================= */

function resetPipeline() {

    Object.values(
        pipelineSteps
    ).forEach(
        function (step) {

            if (!step) {
                return;
            }

            step.classList.remove(
                "active",
                "completed"
            );

        }
    );

}


/* =========================================================
   PIPELINE — ACTIVE
========================================================= */

function activatePipeline(
    stepName
) {

    const step =
        pipelineSteps[stepName];


    if (!step) {
        return;
    }


    step.classList.add(
        "active"
    );

}


/* =========================================================
   PIPELINE — COMPLETE
========================================================= */

function completePipeline(
    stepName
) {

    const step =
        pipelineSteps[stepName];


    if (!step) {
        return;
    }


    step.classList.remove(
        "active"
    );

    step.classList.add(
        "completed"
    );

}


/* =========================================================
   CHAT — RESET
========================================================= */

function resetChat() {

    chatArea.innerHTML = "";


    const newEmptyChat =
        document.createElement("div");


    newEmptyChat.className =
        "empty-chat";


    newEmptyChat.id =
        "emptyChat";


    newEmptyChat.innerHTML = `

        <div class="empty-icon">
            ✨
        </div>

        <h3>
            Ready when you are.
        </h3>

        <p>
            Upload a PDF and start asking
            questions about it.
        </p>

        <div class="suggestions">

            <button
                type="button"
                class="suggestion"
            >
                What is this PDF about?
            </button>

            <button
                type="button"
                class="suggestion"
            >
                Summarize the main points
            </button>

            <button
                type="button"
                class="suggestion"
            >
                Explain this in simple words
            </button>

            <button
                type="button"
                class="suggestion"
            >
                What are the key findings?
            </button>

        </div>

    `;


    chatArea.appendChild(
        newEmptyChat
    );


    attachSuggestionEvents(
        newEmptyChat
    );


    contextPanel.hidden =
        true;

}


/* =========================================================
   SUGGESTION EVENTS
========================================================= */

function attachSuggestionEvents(
    container
) {

    const buttons =
        container.querySelectorAll(
            ".suggestion"
        );


    buttons.forEach(
        function (button) {

            button.addEventListener(
                "click",
                function () {

                    if (!pdfProcessed) {

                        showError(
                            "Upload a PDF first."
                        );

                        return;
                    }


                    questionInput.value =
                        button.textContent.trim();


                    questionInput.focus();


                    autoResizeTextarea();

                }
            );

        }
    );

}


/* =========================================================
   CHAT — WELCOME
========================================================= */

function showWelcomeMessage(
    filename,
    pages,
    chunksCount
) {

    chatArea.innerHTML = "";


    const message =
        document.createElement("div");


    message.className =
        "message ai";


    message.innerHTML = `

        <div class="message-bubble">

            ✨ <strong>${escapeHTML(filename)}</strong>
            is ready.

            <br><br>

            I processed
            <strong>${pages}</strong> pages
            into
            <strong>${chunksCount}</strong> chunks.

            <br><br>

            Ask me anything about your document.

        </div>

    `;


    chatArea.appendChild(
        message
    );

}


/* =========================================================
   CHAT — ADD MESSAGE
========================================================= */

function addMessage(
    text,
    type
) {

    const message =
        document.createElement("div");


    message.className =
        `message ${type}`;


    const bubble =
        document.createElement("div");


    bubble.className =
        "message-bubble";


    if (type === "ai") {

        bubble.innerHTML =
            formatAIText(text);

    } else {

        bubble.textContent =
            text;

    }


    message.appendChild(
        bubble
    );


    chatArea.appendChild(
        message
    );


    scrollChatToBottom();


    return message;

}


/* =========================================================
   LOADING MESSAGE
========================================================= */

function addLoadingMessage() {

    const message =
        document.createElement("div");


    message.className =
        "message ai";


    message.innerHTML = `

        <div
            class="message-bubble"
        >

            <span class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </span>

        </div>

    `;


    chatArea.appendChild(
        message
    );


    scrollChatToBottom();


    return message;

}


/* =========================================================
   REMOVE LOADING MESSAGE
========================================================= */

function removeLoadingMessage(
    message
) {

    if (
        message &&
        message.parentNode
    ) {

        message.parentNode.removeChild(
            message
        );

    }

}


/* =========================================================
   FORMAT AI TEXT
========================================================= */

function formatAIText(text) {

    if (!text) {
        return "";
    }


    let safeText =
        escapeHTML(text);


    safeText =
        safeText.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );


    safeText =
        safeText.replace(
            /\n/g,
            "<br>"
        );


    return safeText;

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
    text
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text;


    return div.innerHTML;

}


/* =========================================================
   SCROLL CHAT
========================================================= */

function scrollChatToBottom() {

    chatArea.scrollTo({

        top:
            chatArea.scrollHeight,

        behavior:
            "smooth"

    });

}


/* =========================================================
   FILE SIZE
========================================================= */

function formatFileSize(
    bytes
) {

    if (bytes === 0) {
        return "0 KB";
    }


    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];


    const index =
        Math.floor(
            Math.log(bytes) /
            Math.log(1024)
        );


    const size =
        bytes /
        Math.pow(
            1024,
            index
        );


    return (
        Math.round(
            size * 100
        ) / 100
    ) +
        " " +
        units[index];

}


/* =========================================================
   WAIT
========================================================= */

function wait(
    milliseconds
) {

    return new Promise(
        function (resolve) {

            setTimeout(
                resolve,
                milliseconds
            );

        }
    );

}


/* =========================================================
   PREVENT DEFAULT DROP
========================================================= */

window.addEventListener(
    "dragover",
    function (event) {

        event.preventDefault();

    }
);


window.addEventListener(
    "drop",
    function (event) {

        event.preventDefault();

    }
);


/* =========================================================
   NUSHX READY
========================================================= */

console.log(
    "%c✦ NUSHX frontend loaded",
    "color:#a78bfa;font-size:14px;font-weight:bold;"
);

console.log(
    "%cPDF → Extract → Chunk → TF-IDF → Retrieve → Groq",
    "color:#ec4899;font-size:11px;"
);