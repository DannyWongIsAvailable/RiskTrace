from pathlib import Path
import os

from dotenv import load_dotenv
from deepseek_harness import DeepSeekHarness


load_dotenv()


BASE_DIR = Path(__file__).resolve().parent

WORKSPACE = BASE_DIR / "workspace"
SESSIONS = BASE_DIR / "sessions"


def main():


    with DeepSeekHarness(
        provider="deepseek-official",
        model="deepseek-v4-flash",
        cwd=str(WORKSPACE),
        session_root=str(SESSIONS),
    ) as harness:

        result = harness.run(
            """
请检查你当前可以访问的工作目录。

1. 告诉我当前工作目录路径。
2. 列出当前目录中的文件。
3. 找到 project.txt 并读取内容。
4. 告诉我：
   - 项目名称
   - 采购金额
   - 采购方式
   - 测试编号
5. 不要猜测，只根据你实际读取到的文件回答。
""",
            session_id="workspace-test-001",
        )

        print(result.final_response)
        print(result.finish_reason)


if __name__ == "__main__":
    main()