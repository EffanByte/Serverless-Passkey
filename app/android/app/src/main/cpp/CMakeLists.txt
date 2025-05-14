# app/android/app/src/main/cpp/CMakeLists.txt
cmake_minimum_required(VERSION 3.10)
project(ml_dsa)

# Path to this directory
set(CPP_DIR ${CMAKE_CURRENT_SOURCE_DIR})

# Grab every .c in the PQClean ml-dsa-44/clean folder
file(GLOB MLDSA_SOURCES
        "${CPP_DIR}/ml-dsa-44/clean/*.c"
)

# Build a *SHARED* library (not STATIC)
add_library(
        ml_dsa               # ← this is the name you’ll pass to System.loadLibrary()
        SHARED
        ml_dsa_flutter_wrapper.c
        ${MLDSA_SOURCES}
)

# Tell the compiler where to find the PQClean headers
target_include_directories(
        ml_dsa
        PRIVATE
        ${CPP_DIR}/ml-dsa-44/clean
)

# Link against Android’s log library (optional)
find_library(log-lib log)
target_link_libraries(
        ml_dsa
        PRIVATE
        ${log-lib}
)
