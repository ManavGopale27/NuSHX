from flask import Flask, render_template, request, jsonify
from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from groq import Groq

import os
import re


# =========================================================
# NUSHX — AI PDF ASSISTANT
# Backend
# =========================================================

app = Flask(__name__)

# Maximum upload size: 20 MB
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024


# =========================================================
# GLOBAL DOCUMENT STATE
# =========================================================

document_data = {
    "filename": None,
    "pages": 0,
    "chunks": [],
    "vectorizer": None,
    "tfidf_matrix": None
}


# =========================================================
# GROQ CLIENT
# =========================================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

groq_client = None

if GROQ_API_KEY:
    groq_client = Groq(
        api_key=GROQ_API_KEY
    )


# =========================================================
# HOME
# =========================================================

@app.route("/")
def home():

    return render_template(
        "index.html"
    )


# =========================================================
# TEXT CLEANING
# =========================================================

def clean_text(text):

    if not text:
        return ""

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# =========================================================
# CREATE CHUNKS
# =========================================================

def create_chunks(
    text,
    chunk_size=800,
    overlap=150
):

    if not text:
        return []


    words = text.split()

    chunks = []

    start = 0

    while start < len(words):

        end = start + chunk_size

        chunk_words = words[
            start:end
        ]

        chunk = " ".join(
            chunk_words
        ).strip()


        if chunk:

            chunks.append(
                chunk
            )


        if end >= len(words):
            break


        start = end - overlap


    return chunks


# =========================================================
# BUILD TF-IDF
# =========================================================

def build_tfidf(chunks):

    if not chunks:

        return None, None


    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        max_features=10000
    )


    try:

        matrix = vectorizer.fit_transform(
            chunks
        )

    except ValueError:

        # Fallback if the PDF contains
        # very little usable text.

        vectorizer = TfidfVectorizer(
            lowercase=True,
            max_features=10000
        )

        matrix = vectorizer.fit_transform(
            chunks
        )


    return vectorizer, matrix


# =========================================================
# UPLOAD PDF
# =========================================================

@app.route(
    "/upload",
    methods=["POST"]
)
def upload_pdf():

    try:

        # -------------------------------------------------
        # Check file
        # -------------------------------------------------

        if "file" not in request.files:

            return jsonify({
                "success": False,
                "error": "No PDF file was uploaded."
            }), 400


        file = request.files["file"]


        if not file or not file.filename:

            return jsonify({
                "success": False,
                "error": "Please select a PDF file."
            }), 400


        # -------------------------------------------------
        # Check extension
        # -------------------------------------------------

        if not file.filename.lower().endswith(".pdf"):

            return jsonify({
                "success": False,
                "error": "Only PDF files are supported."
            }), 400


        # -------------------------------------------------
        # Read PDF
        # -------------------------------------------------

        reader = PdfReader(
            file
        )


        total_pages = len(
            reader.pages
        )


        if total_pages == 0:

            return jsonify({
                "success": False,
                "error": "The PDF contains no pages."
            }), 400


        # -------------------------------------------------
        # Extract text
        # -------------------------------------------------

        full_text = ""


        for page in reader.pages:

            try:

                page_text = page.extract_text()

            except Exception:

                page_text = ""


            if page_text:

                full_text += "\n"
                full_text += page_text


        full_text = clean_text(
            full_text
        )


        if not full_text:

            return jsonify({
                "success": False,
                "error":
                    "No readable text was found in this PDF."
            }), 400


        # -------------------------------------------------
        # Chunk text
        # -------------------------------------------------

        chunks = create_chunks(
            full_text
        )


        if not chunks:

            return jsonify({
                "success": False,
                "error":
                    "Unable to create text chunks."
            }), 400


        # -------------------------------------------------
        # TF-IDF
        # -------------------------------------------------

        vectorizer, tfidf_matrix = build_tfidf(
            chunks
        )


        if vectorizer is None:

            return jsonify({
                "success": False,
                "error":
                    "Unable to create TF-IDF vectors."
            }), 400


        # -------------------------------------------------
        # Save document state
        # -------------------------------------------------

        document_data["filename"] = (
            file.filename
        )

        document_data["pages"] = (
            total_pages
        )

        document_data["chunks"] = (
            chunks
        )

        document_data["vectorizer"] = (
            vectorizer
        )

        document_data["tfidf_matrix"] = (
            tfidf_matrix
        )


        # -------------------------------------------------
        # Console information
        # -------------------------------------------------

        print()
        print("=" * 60)
        print("NUSHX PDF PROCESSED")
        print("=" * 60)
        print(
            f"File   : {file.filename}"
        )
        print(
            f"Pages  : {total_pages}"
        )
        print(
            f"Chunks : {len(chunks)}"
        )
        print(
            "TF-IDF : Ready"
        )
        print("=" * 60)
        print()


        # -------------------------------------------------
        # Response
        # -------------------------------------------------

        return jsonify({

            "success": True,

            "filename":
                file.filename,

            "pages":
                total_pages,

            "chunks":
                len(chunks)

        })


    except Exception as error:

        print(
            "UPLOAD ERROR:",
            error
        )


        return jsonify({

            "success": False,

            "error":
                f"PDF processing failed: {str(error)}"

        }), 500


# =========================================================
# RETRIEVE RELEVANT CHUNKS
# =========================================================

def retrieve_chunks(
    question,
    top_k=3
):

    vectorizer = (
        document_data["vectorizer"]
    )

    matrix = (
        document_data["tfidf_matrix"]
    )

    chunks = (
        document_data["chunks"]
    )


    if (
        vectorizer is None
        or matrix is None
        or not chunks
    ):

        return []


    # -----------------------------------------------------
    # Convert question into TF-IDF vector
    # -----------------------------------------------------

    question_vector = (
        vectorizer.transform(
            [question]
        )
    )


    # -----------------------------------------------------
    # Cosine similarity
    # -----------------------------------------------------

    similarities = (
        cosine_similarity(
            question_vector,
            matrix
        )[0]
    )


    # -----------------------------------------------------
    # Get top chunks
    # -----------------------------------------------------

    ranked_indexes = (
        similarities.argsort()[::-1]
    )


    results = []


    for index in ranked_indexes[:top_k]:

        score = float(
            similarities[index]
        )


        results.append({

            "text":
                chunks[index],

            "score":
                score

        })


    return results


# =========================================================
# GROQ ANSWER
# =========================================================

def generate_answer(
    question,
    retrieved_chunks
):

    if not groq_client:

        raise RuntimeError(
            "GROQ_API_KEY is not configured. "
            "Please set your Groq API key."
        )


    # -----------------------------------------------------
    # Build context
    # -----------------------------------------------------

    context_parts = []


    for item in retrieved_chunks:

        context_parts.append(
            item["text"]
        )


    context = "\n\n".join(
        context_parts
    )


    # -----------------------------------------------------
    # Prompt
    # -----------------------------------------------------

    system_prompt = """
You are NUSHX, an AI PDF assistant.

Answer the user's question using ONLY
the provided document context.

Rules:

1. Do not invent information.
2. If the answer is not present in the
   context, clearly say that the information
   could not be found in the document.
3. Keep the answer clear and easy to understand.
4. Use simple language.
5. You may use bullet points when useful.
"""


    user_prompt = f"""
DOCUMENT CONTEXT:

{context}


USER QUESTION:

{question}


Answer based only on the document context.
"""


    # -----------------------------------------------------
    # Groq request
    # -----------------------------------------------------

    response = groq_client.chat.completions.create(

        model="llama-3.1-8b-instant",

        messages=[

            {
                "role": "system",
                "content": system_prompt
            },

            {
                "role": "user",
                "content": user_prompt
            }

        ],

        temperature=0.2,

        max_tokens=800

    )


    answer = (
        response
        .choices[0]
        .message
        .content
    )


    return answer, context


# =========================================================
# ASK QUESTION
# =========================================================

@app.route(
    "/ask",
    methods=["POST"]
)
def ask_question():

    try:

        # -------------------------------------------------
        # Check document
        # -------------------------------------------------

        if not document_data["chunks"]:

            return jsonify({

                "success": False,

                "error":
                    "Please upload and process a PDF first."

            }), 400


        # -------------------------------------------------
        # Get JSON
        # -------------------------------------------------

        data = request.get_json(
            silent=True
        )


        if not data:

            return jsonify({

                "success": False,

                "error":
                    "Invalid request."

            }), 400


        question = (
            data.get("question", "")
            .strip()
        )


        if not question:

            return jsonify({

                "success": False,

                "error":
                    "Please enter a question."

            }), 400


        # -------------------------------------------------
        # Retrieve
        # -------------------------------------------------

        retrieved = retrieve_chunks(
            question,
            top_k=3
        )


        if not retrieved:

            return jsonify({

                "success": False,

                "error":
                    "No relevant information was found."

            }), 404


        # -------------------------------------------------
        # Best similarity score
        # -------------------------------------------------

        best_score = max(
            item["score"]
            for item in retrieved
        )


        similarity_percent = round(
            best_score * 100
        )


        # -------------------------------------------------
        # Generate AI answer
        # -------------------------------------------------

        answer, context = generate_answer(
            question,
            retrieved
        )


        # -------------------------------------------------
        # Console
        # -------------------------------------------------

        print()
        print("-" * 60)
        print("NUSHX QUESTION")
        print("-" * 60)
        print(
            "Question:",
            question
        )
        print(
            "Similarity:",
            f"{similarity_percent}%"
        )
        print("-" * 60)
        print()


        # -------------------------------------------------
        # Response
        # -------------------------------------------------

        return jsonify({

            "success": True,

            "answer":
                answer,

            "context":
                context,

            "similarity":
                similarity_percent

        })


    except Exception as error:

        print(
            "ASK ERROR:",
            error
        )


        return jsonify({

            "success": False,

            "error":
                f"Unable to generate answer: {str(error)}"

        }), 500


# =========================================================
# FILE SIZE ERROR
# =========================================================

@app.errorhandler(413)
def file_too_large(error):

    return jsonify({

        "success": False,

        "error":
            "File is too large. Maximum size is 20 MB."

    }), 413


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    print()
    print("=" * 60)
    print("✦ NUSHX — AI PDF ASSISTANT")
    print("=" * 60)
    print("Server : http://127.0.0.1:5000")
    print(
        "Groq   :",
        "CONFIGURED" if GROQ_API_KEY else "NOT CONFIGURED"
    )
    print("=" * 60)
    print()


    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )