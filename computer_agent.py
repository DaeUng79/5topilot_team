import base64
import io
import json
import os
import platform
import subprocess
import time
from typing import Any

import pyautogui
import pyperclip

from openai import OpenAI
from fastapi import FastAPI
from pydantic import BaseModel


# ============================================================
# 기본 설정
# ============================================================

LLAMA_BASE_URL = os.getenv(
    "LLAMA_BASE_URL",
    "http://127.0.0.1:8080/v1"
)

MODEL_NAME = os.getenv(
    "MODEL_NAME",
    "gemma-4-E2B-it-GGUF"
)

# 한 번의 사용자 요청에서 최대 몇 단계까지 행동할지
MAX_STEPS = 25

# Tool 호출 사이 최소 대기
ACTION_DELAY = 0.5


# ============================================================
# OpenAI-compatible llama-server client
# ============================================================

client = OpenAI(
    base_url=LLAMA_BASE_URL,
    api_key="local"
)


# ============================================================
# FastAPI
# ============================================================

app = FastAPI(
    title="Local Computer Use Agent",
    version="1.0.0"
)


# ============================================================
# PyAutoGUI 설정
# ============================================================

# 자동화 중 마우스가 너무 빠르게 움직이는 것을 방지
pyautogui.PAUSE = 0.15

# pyautogui 안전장치
# 마우스를 화면 좌측 상단으로 이동하면 중지 가능
pyautogui.FAILSAFE = True


# ============================================================
# 화면 캡처
# ============================================================

def screenshot_base64() -> tuple[str, int, int]:
    """
    현재 화면을 캡처해서 JPEG Base64로 반환한다.

    반환:
        base64 문자열
        실제 화면 width
        실제 화면 height
    """

    image = pyautogui.screenshot()

    # --------------------------------------------
    # RGBA -> RGB
    # JPEG는 RGBA를 직접 저장할 수 없으므로 변환
    # --------------------------------------------

    if image.mode != "RGB":
        image = image.convert("RGB")

    screen_width, screen_height = image.size

    # --------------------------------------------
    # 너무 큰 Retina 화면은 모델 입력량을 줄인다.
    # --------------------------------------------

    max_width = 1920

    if screen_width > max_width:

        ratio = max_width / screen_width

        new_width = max_width

        new_height = int(
            screen_height * ratio
        )

        image = image.resize(
            (new_width, new_height)
        )

    # --------------------------------------------
    # JPEG 저장
    # --------------------------------------------

    buffer = io.BytesIO()

    image.save(
        buffer,
        format="JPEG",
        quality=82,
        optimize=True
    )

    encoded = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    return (
        encoded,
        screen_width,
        screen_height
    )


# ============================================================
# Browser 실행
# ============================================================

def open_browser(
    browser: str,
    url: str
) -> dict[str, Any]:

    browser = browser.lower().strip()

    system = platform.system()

    aliases = {

        "크롬": "chrome",
        "클롬": "chrome",
        "chrome": "chrome",

        "사파리": "safari",
        "safari": "safari",

        "엣지": "edge",
        "edge": "edge",

        "파이어폭스": "firefox",
        "firefox": "firefox",

        "익스플로러": "ie",
        "internet explorer": "ie",
        "ie": "ie",
    }

    browser = aliases.get(
        browser,
        browser
    )

    print(
        f"[BROWSER] {browser} -> {url}"
    )

    # ========================================================
    # macOS
    # ========================================================

    if system == "Darwin":

        applications = {

            "safari":
                "Safari",

            "chrome":
                "Google Chrome",

            "edge":
                "Microsoft Edge",

            "firefox":
                "Firefox"
        }

        # IE는 macOS에서 사용 불가
        if browser == "ie":

            return {
                "success": False,
                "message":
                    "macOS에서는 Internet Explorer를 "
                    "실행할 수 없습니다."
            }

        application = applications.get(
            browser
        )

        if application is None:

            return {
                "success": False,
                "message":
                    f"지원하지 않는 브라우저: {browser}"
            }

        try:

            subprocess.Popen([
                "open",
                "-a",
                application,
                url
            ])

            # 브라우저 실행 대기
            time.sleep(2)

            return {

                "success": True,

                "browser":
                    browser,

                "application":
                    application,

                "url":
                    url
            }

        except Exception as e:

            return {

                "success": False,

                "message":
                    str(e)
            }

    # ========================================================
    # Windows
    # ========================================================

    if system == "Windows":

        commands = {

            "chrome": [
                "chrome",
                "--new-window",
                url
            ],

            "edge": [
                "msedge",
                "--new-window",
                url
            ],

            "firefox": [
                "firefox",
                "-new-window",
                url
            ],

            "ie": [
                "iexplore",
                url
            ]
        }

        command = commands.get(
            browser
        )

        if command is None:

            return {

                "success": False,

                "message":
                    f"지원하지 않는 브라우저: {browser}"
            }

        try:

            subprocess.Popen(
                command,
                shell=True
            )

            time.sleep(2)

            return {

                "success": True,

                "browser":
                    browser,

                "url":
                    url
            }

        except Exception as e:

            return {

                "success": False,

                "message":
                    str(e)
            }

    # ========================================================
    # Linux
    # ========================================================

    if system == "Linux":

        commands = {

            "chrome": [
                "google-chrome",
                url
            ],

            "edge": [
                "microsoft-edge",
                url
            ],

            "firefox": [
                "firefox",
                url
            ]
        }

        command = commands.get(
            browser
        )

        if command is None:

            return {

                "success": False,

                "message":
                    f"지원하지 않는 브라우저: {browser}"
            }

        try:

            subprocess.Popen(
                command
            )

            time.sleep(2)

            return {

                "success": True,

                "browser":
                    browser,

                "url":
                    url
            }

        except Exception as e:

            return {

                "success": False,

                "message":
                    str(e)
            }

    return {

        "success": False,

        "message":
            f"지원하지 않는 OS: {system}"
    }


# ============================================================
# 좌표 변환
# ============================================================

def normalized_to_screen(
    x: int,
    y: int
) -> tuple[int, int]:
    """
    Gemma가 반환한 0~1000 정규화 좌표를
    실제 화면 좌표로 변환한다.

    예:
        모델 (500, 500)
        -> 실제 화면 중앙
    """

    screen_width, screen_height = pyautogui.size()

    x = max(
        0,
        min(
            1000,
            int(x)
        )
    )

    y = max(
        0,
        min(
            1000,
            int(y)
        )
    )

    real_x = int(
        x / 1000 * screen_width
    )

    real_y = int(
        y / 1000 * screen_height
    )

    # 안전하게 화면 영역 안으로 제한
    real_x = max(
        0,
        min(
            screen_width - 1,
            real_x
        )
    )

    real_y = max(
        0,
        min(
            screen_height - 1,
            real_y
        )
    )

    return (
        real_x,
        real_y
    )


# ============================================================
# 마우스 클릭
# ============================================================

def click(
    x: int,
    y: int,
    button: str = "left"
) -> dict[str, Any]:

    try:

        real_x, real_y = normalized_to_screen(
            x,
            y
        )

        print(
            f"[CLICK] "
            f"model=({x},{y}) "
            f"screen=({real_x},{real_y})"
        )

        pyautogui.moveTo(
            real_x,
            real_y,
            duration=0.2
        )

        pyautogui.click(
            button=button
        )

        time.sleep(
            ACTION_DELAY
        )

        return {

            "success": True,

            "action":
                "click",

            "model_x":
                x,

            "model_y":
                y,

            "screen_x":
                real_x,

            "screen_y":
                real_y,

            "button":
                button
        }

    except Exception as e:

        return {

            "success": False,

            "action":
                "click",

            "message":
                str(e)
        }


# ============================================================
# 텍스트 입력
# ============================================================

def type_text(
    text: str
) -> dict[str, Any]:

    try:

        print(
            f"[TYPE] {repr(text)}"
        )

        # --------------------------------------------
        # pyautogui.write는 한글 입력에 적합하지 않음
        # 클립보드 붙여넣기 사용
        # --------------------------------------------

        pyperclip.copy(
            text
        )

        time.sleep(
            0.2
        )

        if platform.system() == "Darwin":

            pyautogui.hotkey(
                "command",
                "v"
            )

        else:

            pyautogui.hotkey(
                "ctrl",
                "v"
            )

        time.sleep(
            ACTION_DELAY
        )

        return {

            "success": True,

            "action":
                "type_text",

            "text":
                text
        }

    except Exception as e:

        return {

            "success": False,

            "action":
                "type_text",

            "text":
                text,

            "message":
                str(e)
        }


# ============================================================
# 키 입력
# ============================================================

def press_key(
    key: str
) -> dict[str, Any]:

    allowed_keys = {

        "enter",
        "esc",
        "tab",
        "space",

        "backspace",
        "delete",

        "home",
        "end",

        "up",
        "down",
        "left",
        "right",

        "pageup",
        "pagedown",

        "f5"
    }

    key = key.lower().strip()

    if key not in allowed_keys:

        return {

            "success": False,

            "message":
                f"허용되지 않은 키: {key}"
        }

    try:

        print(
            f"[KEY] {key}"
        )

        pyautogui.press(
            key
        )

        time.sleep(
            ACTION_DELAY
        )

        return {

            "success": True,

            "action":
                "press_key",

            "key":
                key
        }

    except Exception as e:

        return {

            "success": False,

            "action":
                "press_key",

            "message":
                str(e)
        }


# ============================================================
# 스크롤
# ============================================================

def scroll(
    amount: int
) -> dict[str, Any]:

    try:

        # 너무 큰 값 방지
        amount = max(
            -10,
            min(
                10,
                int(amount)
            )
        )

        print(
            f"[SCROLL] {amount}"
        )

        pyautogui.scroll(
            amount
        )

        time.sleep(
            ACTION_DELAY
        )

        return {

            "success": True,

            "action":
                "scroll",

            "amount":
                amount
        }

    except Exception as e:

        return {

            "success": False,

            "action":
                "scroll",

            "message":
                str(e)
        }


# ============================================================
# 대기
# ============================================================

def wait_seconds(
    seconds: float
) -> dict[str, Any]:

    try:

        seconds = max(
            0.2,
            min(
                5.0,
                float(seconds)
            )
        )

        print(
            f"[WAIT] {seconds} sec"
        )

        time.sleep(
            seconds
        )

        return {

            "success": True,

            "action":
                "wait",

            "seconds":
                seconds
        }

    except Exception as e:

        return {

            "success": False,

            "action":
                "wait",

            "message":
                str(e)
        }


# ============================================================
# Tool 정의
# ============================================================

TOOLS = [

    # --------------------------------------------------------
    # 브라우저 열기
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "open_browser",

            "description":
                (
                    "사용자의 PC에서 브라우저를 열고 "
                    "지정한 URL을 연다."
                ),

            "parameters": {

                "type":
                    "object",

                "properties": {

                    "browser": {

                        "type":
                            "string",

                        "enum": [

                            "chrome",
                            "safari",
                            "edge",
                            "firefox",
                            "ie"
                        ]
                    },

                    "url": {

                        "type":
                            "string"
                    }
                },

                "required": [

                    "browser",
                    "url"
                ]
            }
        }
    },

    # --------------------------------------------------------
    # 화면 캡처
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "screenshot",

            "description":
                (
                    "현재 PC 화면을 캡처한다. "
                    "현재 화면의 버튼, 입력창, 링크 등을 "
                    "확인해야 할 때 사용한다."
                ),

            "parameters": {

                "type":
                    "object",

                "properties":
                    {}
            }
        }
    },

    # --------------------------------------------------------
    # 클릭
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "click",

            "description":
                (
                    "화면의 특정 위치를 클릭한다. "
                    "x,y는 screenshot 화면을 기준으로 "
                    "0~1000 사이의 정규화 좌표다."
                ),

            "parameters": {

                "type":
                    "object",

                "properties": {

                    "x": {

                        "type":
                            "integer",

                        "minimum":
                            0,

                        "maximum":
                            1000
                    },

                    "y": {

                        "type":
                            "integer",

                        "minimum":
                            0,

                        "maximum":
                            1000
                    },

                    "button": {

                        "type":
                            "string",

                        "enum": [
                            "left",
                            "right"
                        ]
                    }
                },

                "required": [

                    "x",
                    "y"
                ]
            }
        }
    },

    # --------------------------------------------------------
    # 텍스트 입력
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "type_text",

            "description":
                (
                    "현재 포커스된 입력창에 정확한 문자열을 "
                    "입력한다. 한글은 이 도구를 사용한다."
                ),

            "parameters": {

                "type":
                    "object",

                "properties": {

                    "text": {

                        "type":
                            "string",

                        "description":
                            (
                                "사용자가 입력을 요청한 "
                                "문자열을 그대로 사용한다."
                            )
                    }
                },

                "required": [

                    "text"
                ]
            }
        }
    },

    # --------------------------------------------------------
    # 키 입력
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "press_key",

            "description":
                "키보드의 특정 키를 누른다.",

            "parameters": {

                "type":
                    "object",

                "properties": {

                    "key": {

                        "type":
                            "string",

                        "enum": [

                            "enter",
                            "esc",
                            "tab",
                            "space",
                            "backspace",
                            "delete",
                            "home",
                            "end",
                            "up",
                            "down",
                            "left",
                            "right",
                            "pageup",
                            "pagedown",
                            "f5"
                        ]
                    }
                },

                "required": [

                    "key"
                ]
            }
        }
    },

    # --------------------------------------------------------
    # 스크롤
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "scroll",

            "description":
                (
                    "현재 화면을 위 또는 아래로 스크롤한다. "
                    "양수는 위, 음수는 아래다."
                ),

            "parameters": {

                "type":
                    "object",

                "properties": {

                    "amount": {

                        "type":
                            "integer",

                        "minimum":
                            -10,

                        "maximum":
                            10
                    }
                },

                "required": [

                    "amount"
                ]
            }
        }
    },

    # --------------------------------------------------------
    # 대기
    # --------------------------------------------------------

    {
        "type": "function",

        "function": {

            "name":
                "wait",

            "description":
                "웹페이지 로딩 등을 위해 잠시 기다린다.",

            "parameters": {

                "type":
                    "object",

                "properties": {

                    "seconds": {

                        "type":
                            "number",

                        "minimum":
                            0.2,

                        "maximum":
                            5
                    }
                },

                "required": [

                    "seconds"
                ]
            }
        }
    }
]


# ============================================================
# 시스템 프롬프트
# ============================================================

SYSTEM_PROMPT = """
너는 로컬 PC를 제어하는 Computer Use Agent다.

사용자의 요청을 실제 PC에서 수행해야 한다.

============================================================
기본 원칙
============================================================

1. 화면 상태를 모르면 반드시 screenshot을 호출한다.

2. screenshot을 확인한 뒤 다음 행동을 결정한다.

3. 화면의 입력창이나 버튼을 찾아야 한다면
   screenshot을 먼저 확인한다.

4. click 좌표는 0~1000 사이의 정규화 좌표다.

5. 화면의 오른쪽 위는 약 (900,100),
   중앙은 약 (500,500),
   왼쪽 아래는 약 (100,900)이다.

6. click 후에는 필요하면 screenshot을 다시 호출한다.

7. 한글 입력에는 반드시 type_text를 사용한다.

8. type_text의 text는 사용자가 요청한 문자열을
   문자 하나까지 그대로 사용한다.

9. 사용자가 "양산시청"이라고 했으면
   절대로 "양산", "ㅍ", "yangsan" 등으로 바꾸지 않는다.

10. 검색이나 클릭을 수행한 뒤 실제 화면 상태를
    확인해야 한다면 screenshot을 다시 호출한다.

============================================================
네이버
============================================================

사용자가 "네이버"라고 하면:

https://www.naver.com

을 사용한다.

============================================================
브라우저
============================================================

크롬:
chrome

클롬:
chrome

사파리:
safari

엣지:
edge

파이어폭스:
firefox

익스플로러:
ie

============================================================
권장 행동 패턴
============================================================

사용자:
"크롬으로 네이버를 열고 양산시청을 검색해줘"

권장:

1.
open_browser(
    browser="chrome",
    url="https://www.naver.com"
)

2.
screenshot()

3.
검색창이 명확하게 보이면
click(x,y)

4.
type_text(
    text="양산시청"
)

5.
press_key(
    key="enter"
)

6.
필요하면 screenshot()

============================================================
중요
============================================================

이미 입력창이 포커스되어 있으면 click 없이
type_text를 사용할 수 있다.

반대로 입력창이 어디인지 확실하지 않으면
반드시 screenshot -> click -> type_text 순서로 진행한다.

사용자의 목표가 완료되었다고 판단하면
더 이상 행동하지 말고 완료 메시지를 반환한다.

사용자와 관련 없는 작업을 하지 않는다.

파일 삭제, 시스템 설정 변경, 암호 탈취,
보안 우회 등의 위험한 작업은 하지 않는다.
"""


# ============================================================
# 실제 Tool 실행
# ============================================================

def execute_tool(
    name: str,
    arguments: dict[str, Any]
) -> dict[str, Any]:

    if name == "open_browser":

        return open_browser(
            browser=arguments["browser"],
            url=arguments["url"]
        )

    if name == "screenshot":

        try:

            (
                image_base64,
                width,
                height
            ) = screenshot_base64()

            return {

                "success":
                    True,

                "action":
                    "screenshot",

                "width":
                    width,

                "height":
                    height,

                "image_base64":
                    image_base64
            }

        except Exception as e:

            return {

                "success":
                    False,

                "action":
                    "screenshot",

                "message":
                    str(e)
            }

    if name == "click":

        return click(
            x=arguments["x"],
            y=arguments["y"],
            button=arguments.get(
                "button",
                "left"
            )
        )

    if name == "type_text":

        return type_text(
            text=arguments["text"]
        )

    if name == "press_key":

        return press_key(
            key=arguments["key"]
        )

    if name == "scroll":

        return scroll(
            amount=arguments["amount"]
        )

    if name == "wait":

        return wait_seconds(
            seconds=arguments["seconds"]
        )

    return {

        "success":
            False,

        "message":
            f"알 수 없는 Tool: {name}"
    }


# ============================================================
# Tool 결과 -> llama-server 메시지
# ============================================================

def build_tool_message(
    tool_call_id: str,
    result: dict[str, Any]
) -> dict[str, Any]:

    # ========================================================
    # screenshot 결과
    # ========================================================

    if (
        result.get("action") == "screenshot"
        and result.get("image_base64")
    ):

        image_base64 = result[
            "image_base64"
        ]

        width = result.get(
            "width",
            0
        )

        height = result.get(
            "height",
            0
        )

        return {

            "role":
                "tool",

            "tool_call_id":
                tool_call_id,

            "content": [

                {
                    "type":
                        "text",

                    "text":
                        (
                            "현재 PC 화면이다.\n"
                            f"화면 크기: "
                            f"{width} x {height}\n"
                            "다음 행동이 필요하면 "
                            "화면의 실제 UI 위치를 확인하라.\n"
                            "click 좌표는 0~1000 "
                            "정규화 좌표를 사용한다."
                        )
                },

                {
                    "type":
                        "image_url",

                    "image_url": {

                        "url":
                            (
                                "data:image/jpeg;base64,"
                                + image_base64
                            )
                    }
                }
            ]
        }

    # ========================================================
    # 일반 Tool 결과
    # ========================================================

    return {

        "role":
            "tool",

        "tool_call_id":
            tool_call_id,

        "content":
            json.dumps(
                result,
                ensure_ascii=False
            )
    }


# ============================================================
# Agent 실행
# ============================================================

def run_agent(
    user_request: str
) -> dict[str, Any]:

    print(
        "\n" + "=" * 60
    )

    print(
        "[USER]"
    )

    print(
        user_request
    )

    print(
        "=" * 60
    )

    messages = [

        {
            "role":
                "system",

            "content":
                SYSTEM_PROMPT
        },

        {
            "role":
                "user",

            "content":
                user_request
        }
    ]

    # ========================================================
    # Agent Loop
    # ========================================================

    for step in range(
        MAX_STEPS
    ):

        print(
            f"\n[STEP {step + 1}]"
        )

        try:

            response = client.chat.completions.create(

                model=
                    MODEL_NAME,

                messages=
                    messages,

                tools=
                    TOOLS,

                tool_choice=
                    "auto",

                temperature=
                    0,

                max_tokens=
                    1024
            )

        except Exception as e:

            print(
                "[LLAMA ERROR]"
            )

            print(
                str(e)
            )

            return {

                "success":
                    False,

                "message":
                    f"LLM 호출 오류: {e}",

                "steps":
                    step + 1
            }

        assistant = response.choices[0].message

        # ----------------------------------------------------
        # assistant 메시지 저장
        # ----------------------------------------------------

        assistant_message = (
            assistant.model_dump(
                exclude_none=True
            )
        )

        messages.append(
            assistant_message
        )

        # ----------------------------------------------------
        # Tool 호출이 없는 경우
        # ----------------------------------------------------

        if not assistant.tool_calls:

            final_text = (
                assistant.content
                or
                "작업이 완료되었습니다."
            )

            print(
                "\n[AGENT]"
            )

            print(
                final_text
            )

            return {

                "success":
                    True,

                "message":
                    final_text,

                "steps":
                    step + 1
            }

        # ----------------------------------------------------
        # Tool 실행
        # ----------------------------------------------------

        for tool_call in (
            assistant.tool_calls
        ):

            name = (
                tool_call.function.name
            )

            raw_arguments = (
                tool_call.function.arguments
            )

            print(
                f"[TOOL] {name}"
            )

            print(
                raw_arguments
            )

            # -----------------------------------------------
            # JSON argument 파싱
            # -----------------------------------------------

            try:

                arguments = json.loads(
                    raw_arguments
                )

            except json.JSONDecodeError as e:

                result = {

                    "success":
                        False,

                    "message":
                        (
                            "Tool arguments JSON "
                            f"파싱 오류: {e}"
                        )
                }

            else:

                # -------------------------------------------
                # 실제 PC 제어
                # -------------------------------------------

                result = execute_tool(
                    name=name,
                    arguments=arguments
                )

            # -----------------------------------------------
            # 결과 표시
            # -----------------------------------------------

            print(
                "[RESULT]"
            )

            # image_base64는 콘솔 출력에서 제외
            result_for_print = dict(
                result
            )

            result_for_print.pop(
                "image_base64",
                None
            )

            print(
                result_for_print
            )

            # -----------------------------------------------
            # 모델에 Tool 결과 전달
            # -----------------------------------------------

            messages.append(
                build_tool_message(
                    tool_call_id=
                        tool_call.id,

                    result=
                        result
                )
            )

            # -----------------------------------------------
            # 너무 빠른 연속 조작 방지
            # -----------------------------------------------

            time.sleep(
                ACTION_DELAY
            )

    # ========================================================
    # 최대 단계 초과
    # ========================================================

    return {

        "success":
            False,

        "message":
            (
                f"최대 {MAX_STEPS}단계에 "
                "도달했습니다."
            ),

        "steps":
            MAX_STEPS
    }


# ============================================================
# FastAPI Request
# ============================================================

class AgentRequest(
    BaseModel
):

    message: str


# ============================================================
# FastAPI API
# ============================================================

@app.post(
    "/run"
)
def run_agent_api(
    request: AgentRequest
):

    return run_agent(
        request.message
    )


# ============================================================
# 프로그램 시작
# ============================================================

def main():

    print(
        "=" * 60
    )

    print(
        "Local Computer Use Agent"
    )

    print(
        "=" * 60
    )

    print(
        "LLAMA SERVER:",
        LLAMA_BASE_URL
    )

    print(
        "MODEL:",
        MODEL_NAME
    )

    print(
        "OS:",
        platform.system()
    )

    screen_width, screen_height = (
        pyautogui.size()
    )

    print(
        "SCREEN:",
        f"{screen_width} x {screen_height}"
    )

    print(
        "=" * 60
    )

    print(
        "종료: exit / quit / 종료"
    )

    while True:

        try:

            user_input = input(
                "\n명령 > "
            ).strip()

        except KeyboardInterrupt:

            print(
                "\n종료합니다."
            )

            break

        except EOFError:

            print(
                "\n종료합니다."
            )

            break

        if not user_input:

            continue

        if user_input.lower() in {

            "exit",
            "quit",
            "종료"
        }:

            print(
                "종료합니다."
            )

            break

        result = run_agent(
            user_input
        )

        print(
            "\n결과:"
        )

        print(
            result
        )


# ============================================================
# 실행
# ============================================================

if __name__ == "__main__":

    main()