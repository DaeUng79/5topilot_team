import json
import os
import platform
import shutil
import subprocess
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI


# -------------------------------------------------------
# 설정
# -------------------------------------------------------

LLAMA_BASE_URL = os.getenv(
    "LLAMA_BASE_URL",
    "http://127.0.0.1:8080/v1"
)

LLAMA_MODEL = os.getenv(
    "LLAMA_MODEL",
    "gemma-4-E2B-it-GGUF"
)

client = OpenAI(
    base_url=LLAMA_BASE_URL,
    api_key="no-key-required"
)

app = FastAPI(
    title="Local Computer Use Agent"
)


# -------------------------------------------------------
# 요청 모델
# -------------------------------------------------------

class UserRequest(BaseModel):
    message: str


# -------------------------------------------------------
# 브라우저 실행 함수
# -------------------------------------------------------

def open_browser(
    browser: str,
    url: str
) -> dict:

    system = platform.system()

    browser = browser.lower().strip()

    # 브라우저 이름 통일
    aliases = {
        "chrome": "chrome",
        "크롬": "chrome",

        "safari": "safari",
        "사파리": "safari",

        "edge": "edge",
        "엣지": "edge",

        "firefox": "firefox",
        "파이어폭스": "firefox",

        "ie": "ie",
        "internet explorer": "ie",
        "익스플로러": "ie",
    }

    browser = aliases.get(browser, browser)

    # ---------------------------------------------------
    # macOS
    # ---------------------------------------------------

    if system == "Darwin":

        applications = {
            "safari": "Safari",
            "chrome": "Google Chrome",
            "edge": "Microsoft Edge",
            "firefox": "Firefox",
        }

        if browser == "ie":
            return {
                "success": False,
                "message": (
                    "macOS에는 Internet Explorer를 실행할 수 없습니다."
                )
            }

        application = applications.get(browser)

        if not application:
            return {
                "success": False,
                "message": f"지원하지 않는 브라우저: {browser}"
            }

        try:
            subprocess.Popen([
                "open",
                "-a",
                application,
                url
            ])

            return {
                "success": True,
                "os": "macOS",
                "browser": application,
                "url": url
            }

        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }

    # ---------------------------------------------------
    # Windows
    # ---------------------------------------------------

    if system == "Windows":

        local_app_data = os.environ.get(
            "LOCALAPPDATA",
            ""
        )

        program_files = os.environ.get(
            "PROGRAMFILES",
            ""
        )

        program_files_x86 = os.environ.get(
            "PROGRAMFILES(X86)",
            ""
        )

        browser_paths = {

            "chrome": [
                os.path.join(
                    local_app_data,
                    "Google",
                    "Chrome",
                    "Application",
                    "chrome.exe"
                ),
                os.path.join(
                    program_files,
                    "Google",
                    "Chrome",
                    "Application",
                    "chrome.exe"
                ),
            ],

            "edge": [
                os.path.join(
                    program_files_x86,
                    "Microsoft",
                    "Edge",
                    "Application",
                    "msedge.exe"
                ),
                os.path.join(
                    program_files,
                    "Microsoft",
                    "Edge",
                    "Application",
                    "msedge.exe"
                ),
            ],

            "firefox": [
                os.path.join(
                    program_files,
                    "Mozilla Firefox",
                    "firefox.exe"
                ),
                os.path.join(
                    program_files_x86,
                    "Mozilla Firefox",
                    "firefox.exe"
                ),
            ],

            "ie": [
                os.path.join(
                    program_files,
                    "Internet Explorer",
                    "iexplore.exe"
                ),
                os.path.join(
                    program_files_x86,
                    "Internet Explorer",
                    "iexplore.exe"
                ),
            ]
        }

        paths = browser_paths.get(browser)

        if not paths:
            return {
                "success": False,
                "message": f"지원하지 않는 브라우저: {browser}"
            }

        executable = next(
            (p for p in paths if os.path.exists(p)),
            None
        )

        if executable is None:

            # PATH에 등록된 경우
            command_names = {
                "chrome": "chrome",
                "edge": "msedge",
                "firefox": "firefox",
                "ie": "iexplore",
            }

            executable = shutil.which(
                command_names.get(browser, "")
            )

        if executable is None:

            return {
                "success": False,
                "message": (
                    f"{browser} 실행 파일을 찾지 못했습니다."
                )
            }

        try:

            subprocess.Popen([
                executable,
                url
            ])

            return {
                "success": True,
                "os": "Windows",
                "browser": browser,
                "url": url
            }

        except Exception as e:

            return {
                "success": False,
                "message": str(e)
            }

    # ---------------------------------------------------
    # Linux
    # ---------------------------------------------------

    if system == "Linux":

        commands = {
            "chrome": ["google-chrome"],
            "edge": ["microsoft-edge"],
            "firefox": ["firefox"],
        }

        if browser == "safari" or browser == "ie":

            return {
                "success": False,
                "message": (
                    f"Linux에서는 {browser}를 사용할 수 없습니다."
                )
            }

        command = commands.get(browser)

        if not command:

            return {
                "success": False,
                "message": f"지원하지 않는 브라우저: {browser}"
            }

        executable = shutil.which(command[0])

        if not executable:

            return {
                "success": False,
                "message": (
                    f"{command[0]} 실행 파일을 찾지 못했습니다."
                )
            }

        try:

            subprocess.Popen([
                executable,
                url
            ])

            return {
                "success": True,
                "os": "Linux",
                "browser": browser,
                "url": url
            }

        except Exception as e:

            return {
                "success": False,
                "message": str(e)
            }

    return {
        "success": False,
        "message": f"지원하지 않는 OS: {system}"
    }


# -------------------------------------------------------
# Tool 정의
# -------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "open_browser",
            "description": (
                "사용자의 컴퓨터에서 지정한 브라우저를 열고 "
                "지정된 URL을 연다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "browser": {
                        "type": "string",
                        "description": (
                            "사용할 브라우저. "
                            "chrome, safari, edge, firefox, ie 중 하나"
                        )
                    },
                    "url": {
                        "type": "string",
                        "description": "열 URL"
                    }
                },
                "required": [
                    "browser",
                    "url"
                ]
            }
        }
    }
]


# -------------------------------------------------------
# 시스템 프롬프트
# -------------------------------------------------------

SYSTEM_PROMPT = """
너는 로컬 PC를 제어하는 Computer Use Agent다.

사용자가 브라우저를 열어 달라고 하면
반드시 open_browser 도구를 사용한다.

브라우저 이름:
- 크롬 -> chrome
- 사파리 -> safari
- 엣지 -> edge
- 파이어폭스 -> firefox
- 익스플로러 -> ie

사용자가 '네이버'라고 하면 URL은
https://www.naver.com
을 사용한다.

예:
'크롬으로 네이버 열어줘'
=> open_browser(browser='chrome',
                 url='https://www.naver.com')

'사파리로 네이버 열어줘'
=> open_browser(browser='safari',
                 url='https://www.naver.com')

브라우저 실행이 필요한 요청에서는
설명만 하지 말고 반드시 도구를 호출한다.
"""


# -------------------------------------------------------
# Agent 실행
# -------------------------------------------------------

def run_agent(user_message: str):

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        },
        {
            "role": "user",
            "content": user_message
        }
    ]

    # 첫 번째 LLM 호출
    response = client.chat.completions.create(
        model=LLAMA_MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=0
    )

    assistant_message = response.choices[0].message

    # 일반 답변
    if not assistant_message.tool_calls:

        return {
            "type": "answer",
            "message": assistant_message.content
        }

    # assistant의 tool call 추가
    messages.append(
        assistant_message
    )

    results = []

    # Tool 실행
    for tool_call in assistant_message.tool_calls:

        if tool_call.function.name != "open_browser":
            continue

        try:

            arguments = json.loads(
                tool_call.function.arguments
            )

        except json.JSONDecodeError:

            result = {
                "success": False,
                "message": "Tool arguments JSON 오류"
            }

        else:

            result = open_browser(
                browser=arguments["browser"],
                url=arguments["url"]
            )

        results.append(result)

        # Tool 결과를 다시 모델에 전달
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(
                result,
                ensure_ascii=False
            )
        })

    # 최종 답변
    final_response = client.chat.completions.create(
        model=LLAMA_MODEL,
        messages=messages,
        temperature=0
    )

    return {
        "type": "tool",
        "message": final_response.choices[0].message.content,
        "tool_results": results
    }


# -------------------------------------------------------
# HTTP API
# -------------------------------------------------------

@app.post("/run")
def run(request: UserRequest):

    return run_agent(
        request.message
    )


# -------------------------------------------------------
# 직접 실행 테스트
# -------------------------------------------------------

if __name__ == "__main__":

    import uvicorn

    print("=" * 60)
    print("Local Computer Use Agent")
    print("=" * 60)
    print("LLM:", LLAMA_BASE_URL)
    print("Model:", LLAMA_MODEL)
    print("Agent: http://127.0.0.1:8000")
    print("=" * 60)

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )